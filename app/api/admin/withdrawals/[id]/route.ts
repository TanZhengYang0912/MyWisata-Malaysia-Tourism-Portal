import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import type { WithdrawalReviewDetail } from '@/lib/wallet/withdrawal-review';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: withdrawalId } = await params;
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // Fetch withdrawal with safe joined fields only. Explicitly excludes KYC document paths,
  // IC/passport numbers, raw bank account details and Stripe secrets.
  const { data: row, error } = await db
    .from('withdrawal_requests')
    .select(`
      id, user_id, amount, status, requires_dual_approval, destination_label,
      customer_reason, created_at, updated_at,
      users!inner(
        full_name, email, kyc_status, tier,
        stripe_connect_account_id,
        kyc_submissions(status, reviewed_at, document_type)
      ),
      wallets!inner(
        topup_sen, earnings_sen, pending_earnings_sen,
        reserved_earnings_sen, withdrawn_earnings_sen
      ),
      withdrawal_approvals(
        id, approver_id, action, note, actioned_at,
        users!inner(full_name, email)
      ),
      withdrawal_risk_assessments(
        risk_level, snapshot, overridden_by, override_reason, assessed_at, overridden_at
      )
    `)
    .eq('id', withdrawalId)
    .order('actioned_at', { foreignTable: 'withdrawal_approvals', ascending: true })
    .order('reviewed_at', { foreignTable: 'users.kyc_submissions', ascending: false })
    .limit(1, { foreignTable: 'users.kyc_submissions' })
    .single();

  if (error || !row) return apiFail('NOT_FOUND', 'Withdrawal not found', 404);

  const r = row as Record<string, unknown>;
  const u = r.users as Record<string, unknown>;
  const w = r.wallets as Record<string, unknown>;
  const kycSubs = (u.kyc_submissions as Record<string, unknown>[] | null) ?? [];
  const latestKyc = kycSubs[0] as Record<string, unknown> | undefined;
  const risk = r.withdrawal_risk_assessments as Record<string, unknown> | null;
  const approvals = (r.withdrawal_approvals as Record<string, unknown>[] | null) ?? [];

  // Mask Stripe Connect account ID — show only last 8 chars for receipt reference.
  const rawConnectId = u.stripe_connect_account_id as string | null;
  const destinationLabel = rawConnectId
    ? `Stripe Connect ···${rawConnectId.slice(-8)}`
    : (r.destination_label as string | null) ?? 'Unknown';

  const detail: WithdrawalReviewDetail = {
    id:                  r.id as string,
    userId:              r.user_id as string,
    amountSen:           Math.round((r.amount as number) * 100),
    status:              r.status as string,
    requiresDualApproval: r.requires_dual_approval as boolean,
    approvalCount:       approvals.filter((a) => a.action === 'approve').length,
    riskLevel:           (risk?.risk_level as 'low' | 'review' | 'high') ?? 'low',
    riskOverridden:      risk?.overridden_at != null,
    customer: {
      displayName:  u.full_name as string ?? 'Unknown',
      email:        u.email as string ?? '',
      kycStatus:    u.kyc_status as string ?? 'unverified',
      kycApprovedAt: latestKyc?.reviewed_at as string | null ?? null,
    },
    wallet: {
      topupSen:          (w.topup_sen as number) ?? 0,
      earningsSen:       (w.earnings_sen as number) ?? 0,
      pendingEarningsSen:(w.pending_earnings_sen as number) ?? 0,
      reservedSen:       (w.reserved_earnings_sen as number) ?? 0,
      withdrawnSen:      (w.withdrawn_earnings_sen as number) ?? 0,
    },
    destinationLabel,
    createdAt:      r.created_at as string,
    customerReason: r.customer_reason as string | null,
    approvals: approvals.map((a) => {
      const actor = a.users as Record<string, unknown> | null;
      return {
        actorId:    a.approver_id as string,
        actorLabel: actor?.full_name as string ?? 'Unknown',
        action:     a.action as string,
        note:       a.note as string | null,
        createdAt:  a.actioned_at as string,
      };
    }),
    riskSnapshot: (risk?.snapshot as Record<string, unknown>) ?? {},
  };

  return apiOk(detail);
}

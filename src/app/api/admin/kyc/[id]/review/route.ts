// P-TMF — Admin reviews KYC submission
// POST /api/admin/kyc/[id]/review
//   Body: { action: 'approve'|'reject', reason? }
//   Auth: admin/approver
//   Transaction: via review_kyc RPC (atomic update of submission + users)

import { createClient } from '@/lib/supabase/server';
import { kycReviewSchema, parseBody, apiFail } from '@/lib/validation/schemas';
import { withIdempotency } from '@/lib/idempotency';
import { auditAndNotify } from '@/lib/audit';

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const { id: submissionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', '', 401);

  // Role check (defence in depth — RLS + RPC also check)
  const { data: isAdmin } = await supabase.rpc('is_admin', { uid: user.id });
  if (!isAdmin) return apiFail('FORBIDDEN', 'Admin only', 403);

  const parsed = await parseBody(request, kycReviewSchema);
  if (!parsed.ok) return parsed.response;

  const idem = await withIdempotency(
    request, user.id, `/api/admin/kyc/${submissionId}/review`, parsed.data,
  );
  if (idem.replayed) return idem.replayed;

  const { data: before } = await supabase
    .from('kyc_submissions')
    .select('status, user_id, document_type')
    .eq('id', submissionId)
    .single();

  if (!before) return apiFail('NOT_FOUND', 'Submission not found', 404);
  if (before.status !== 'pending') {
    return apiFail('INVALID_STATE', `Submission is ${before.status}, cannot review`, 409);
  }

  // Atomic: RPC updates kyc_submissions + users.kyc_status in single txn
  const { data: rpcResult, error: rpcError } = await supabase.rpc('review_kyc', {
    p_submission_id: submissionId,
    p_admin_id:      user.id,
    p_action:        parsed.data.action,
    p_reason:        parsed.data.reason ?? null,
  });

  if (rpcError) return apiFail('RPC_ERROR', rpcError.message, 500);

  await auditAndNotify(
    {
      actorId:    user.id,
      action:     `kyc.${parsed.data.action}d`,
      entityType: 'kyc_submission',
      entityId:   submissionId,
      beforeData: { status: 'pending' },
      afterData:  rpcResult,
      note:       parsed.data.reason,
    },
    [{
      userId: before.user_id,
      type:   parsed.data.action === 'approve' ? 'kyc_approved' : 'kyc_rejected',
      title:  parsed.data.action === 'approve'
        ? 'KYC verified — you can now request withdrawals and generate affiliate links!'
        : `KYC rejected: ${parsed.data.reason ?? 'See profile for details'}`,
      link:   '/profile',
    }],
  );

  return idem.record({ data: rpcResult, error: null });
}

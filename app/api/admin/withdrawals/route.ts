import { z } from 'zod';
import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { countCurrentCycleApprovals, type WithdrawalListResponse } from '@/lib/wallet/withdrawal-review';
import { WITHDRAWAL_REVIEW_STATUSES } from '@/lib/wallet/withdrawal-display';
import { postgrestSearchTerm } from '@/lib/validation/postgrest-filter';

export const dynamic = 'force-dynamic';

const PAGE_SIZES = [15, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

const listSchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine((v): v is PageSize => (PAGE_SIZES as readonly number[]).includes(v), {
    message: 'pageSize must be 15, 25, 50 or 100',
  }).default(15),
  status:   z.string().optional(),
  risk:     z.enum(['low', 'review', 'high']).optional(),
  search:   z.string().max(200).optional(),
});

export async function GET(request: Request) {
  const { response } = await requireStaffPermission('admin.withdrawal.approve');
  if (response) return response;
  const service = createServiceClient();

  const url = new URL(request.url);
  const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiFail('VALIDATION_FAILED', 'Invalid query parameters', 422, parsed.error.flatten());
  }

  const { page, pageSize, status, risk, search } = parsed.data;
  const offset = (page - 1) * pageSize;

  // Build query — server-side only, never loads all rows. A risk filter must
  // use an inner relation so unassessed requests cannot leak into the result.
  const riskRelation = risk
    ? 'withdrawal_risk_assessments!inner(risk_level, overridden_at)'
    : 'withdrawal_risk_assessments(risk_level, overridden_at)';
  let query = service
    .from('withdrawal_requests')
    .select(`
      id, user_id, amount, status, requires_dual_approval, approval_cycle, created_at, updated_at,
      users!inner(full_name, email),
      withdrawal_approvals(approver_id, action, approval_cycle),
      ${riskRelation}
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (status === 'review') query = query.in('status', [...WITHDRAWAL_REVIEW_STATUSES]);
  else if (status) query = query.eq('status', status);
  if (risk) query = query.eq('withdrawal_risk_assessments.risk_level', risk);
  if (search) {
    // PostgREST's `or` grammar treats commas and parentheses as operators;
    // strip them before interpolating the user-supplied search term.
    const safeSearch = postgrestSearchTerm(search);
    // The name/email columns belong to the joined (inner) users relation, so the filter must be scoped
    // to it with referencedTable. Qualifying the columns as `users.full_name` inside or() cannot be
    // parsed by PostgREST and made every search return 500.
    if (safeSearch) query = query.or(`full_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`, { referencedTable: 'users' });
  }

  const [listResult, summaryResult] = await Promise.all([
    query,
    service.rpc('get_admin_withdrawal_filter_summary', {
      p_statuses: status === 'review' ? [...WITHDRAWAL_REVIEW_STATUSES] : status ? [status] : null,
      p_risk_level: risk ?? null,
      p_search: search ? postgrestSearchTerm(search) || null : null,
    }),
  ]);
  const { data, count, error } = listResult;
  if (error) {
    console.error('[admin-withdrawals-list]', error);
    return apiFail('LIST_FAILED', 'Failed to load withdrawals', 500);
  }

  if (summaryResult.error || !summaryResult.data || typeof summaryResult.data !== 'object') {
    console.error('[admin-withdrawals-summary]', summaryResult.error);
    return apiFail('SUMMARY_FAILED', 'Unable to load withdrawal summary', 500);
  }

  const items = ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const approvals = (row.withdrawal_approvals as { approver_id: string; action: string; approval_cycle: number | null }[] | null) ?? [];
    const approvalCycle = row.approval_cycle as number | null;
    const riskRelationValue = row.withdrawal_risk_assessments as { risk_level: string; overridden_at: string | null } | { risk_level: string; overridden_at: string | null }[] | null;
    const riskRow = Array.isArray(riskRelationValue) ? riskRelationValue[0] : riskRelationValue;
    const user = row.users as { full_name: string | null; email: string | null } | null;
    return {
      id:                   row.id as string,
      userId:               row.user_id as string,
      customerDisplayName:  user?.full_name ?? 'Unknown',
      amountSen:            Math.round((row.amount as number) * 100),
      status:               row.status as string,
      requiresDualApproval: row.requires_dual_approval as boolean,
      approvalCycle:        approvalCycle ?? 1,
      approvalCount:        countCurrentCycleApprovals(approvals, approvalCycle),
      riskLevel:            (riskRow?.risk_level as 'low' | 'review' | 'high' | null) ?? null,
      riskOverridden:       riskRow?.overridden_at != null,
      createdAt:            row.created_at as string,
      updatedAt:            row.updated_at as string,
    };
  });

  const total = count ?? 0;
  const summary = summaryResult.data as Record<string, unknown>;
  const payoutValueSen = Number(summary.payoutValueSen);
  const highRiskCount = Number(summary.highRiskCount);
  const overdueCount = Number(summary.overdueCount);
  if (![payoutValueSen, highRiskCount, overdueCount].every(Number.isSafeInteger) || [payoutValueSen, highRiskCount, overdueCount].some((value) => value < 0)) {
    return apiFail('SUMMARY_FAILED', 'Unable to load withdrawal summary', 500);
  }
  const payload: WithdrawalListResponse = {
    items,
    total,
    summary: { payoutValueSen, highRiskCount, overdueCount },
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };

  return apiOk(payload);
}

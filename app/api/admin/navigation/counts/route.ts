import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { WITHDRAWAL_REVIEW_STATUSES } from '@/lib/wallet/withdrawal-display';

export const dynamic = 'force-dynamic';

type CountResult = { count: number | null; error: { message: string } | null };

/**
 * Returns the actionable queue sizes used by the admin sidebar. Keeping these
 * counts in one protected endpoint means every badge uses the same polling and
 * failure behaviour without loading whole review queues into the browser.
 */
export async function GET() {
  const authenticated = await createClient();
  const { data: { user }, error: authError } = await authenticated.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: roleRows, error: roleError } = await authenticated
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', user.id);
  type RoleRow = { roles: { name: string } | { name: string }[] | null };
  const roleNames = ((roleRows ?? []) as RoleRow[]).map((row) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return role?.name;
  });
  if (roleError || !roleNames.some((name) => ['admin', 'approver', 'super_admin'].includes(name ?? ''))) {
    return apiFail('FORBIDDEN', 'Admin role required', 403);
  }

  const canReviewContent = roleNames.some((name) => name === 'admin' || name === 'super_admin');
  const canReviewWithdrawals = roleNames.some((name) => name === 'approver' || name === 'super_admin');

  const service = createServiceClient();
  if (!canReviewContent) {
    const withdrawals = await service.from('withdrawal_requests')
      .select('id', { count: 'exact', head: true })
      .in('status', [...WITHDRAWAL_REVIEW_STATUSES]);
    if (withdrawals.error) {
      console.error('[admin-navigation-counts]', withdrawals.error);
      return apiFail('DB_ERROR', 'Unable to load admin queue counts', 500);
    }
    return apiOk({ withdrawals: withdrawals.count ?? 0 });
  }

  const [[vendors, outlets, products, vouchers, refunds, chatReports], [kyc, recommendations], withdrawals] = await Promise.all([
    Promise.all([
      service.from('vendors').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      service.from('outlets').select('id', { count: 'exact', head: true }).eq('review_status', 'pending_review'),
      service.from('products').select('id', { count: 'exact', head: true }).eq('review_status', 'pending_review'),
      service.from('vouchers').select('id', { count: 'exact', head: true }).eq('review_status', 'pending_review'),
      service.from('refunds').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      service.from('chat_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ]),
    canReviewContent
      ? Promise.all([
          service.from('kyc_submissions').select('id', { count: 'exact', head: true }).in('status', ['pending', 'info_requested']),
          service.from('vendor_recommendations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        ])
      : Promise.resolve([null, null] as const),
    canReviewWithdrawals
      ? service.from('withdrawal_requests').select('id', { count: 'exact', head: true }).in('status', [...WITHDRAWAL_REVIEW_STATUSES])
      : Promise.resolve(null),
  ]);

  const results: CountResult[] = [vendors, outlets, products, vouchers, refunds, chatReports];
  if (kyc && recommendations) results.push(kyc, recommendations);
  if (withdrawals) results.push(withdrawals);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error('[admin-navigation-counts]', failed.error);
    return apiFail('DB_ERROR', 'Unable to load admin queue counts', 500);
  }

  return apiOk({
    vendors: vendors.count ?? 0,
    catalogue: (outlets.count ?? 0) + (products.count ?? 0) + (vouchers.count ?? 0),
    refunds: refunds.count ?? 0,
    chatReports: chatReports.count ?? 0,
    ...(kyc && recommendations ? {
      kyc: kyc.count ?? 0,
      recommendations: recommendations.count ?? 0,
    } : {}),
    ...(withdrawals ? { withdrawals: withdrawals.count ?? 0 } : {}),
  });
}

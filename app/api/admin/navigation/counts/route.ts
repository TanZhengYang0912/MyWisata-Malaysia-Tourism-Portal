import { requireStaffAssurance } from '@/lib/auth/staff-assurance';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { WITHDRAWAL_REVIEW_STATUSES } from '@/lib/wallet/withdrawal-display';
import { queueCount, type AdminDashboardSummary, type QueueAvailability } from '@/lib/admin/queue-summary';

export const dynamic = 'force-dynamic';

function privateNoStore(response: Response): Response {
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

type CountResult = { count: number | null; error: { message: string } | null };

function nonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function finiteAmount(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Count only queues the current staff member can actually review. */
export async function GET(request: Request) {
  const dashboardView = new URL(request.url).searchParams.get('view') === 'dashboard';
  const asOf = new Date().toISOString();
  const authenticated = await createClient();
  const { data: { user }, error: authError } = await authenticated.auth.getUser();
  if (authError || !user) return privateNoStore(apiFail('UNAUTHORIZED', 'Sign in required', 401));

  const assuranceResponse = await requireStaffAssurance(authenticated);
  if (assuranceResponse) return privateNoStore(assuranceResponse);
  const [{ data: roleRows, error: roleError }, { data: staffAccess, error: accessError }] = await Promise.all([
    authenticated.from('user_roles').select('roles(name)').eq('user_id', user.id).is('vendor_id', null).is('outlet_id', null),
    authenticated.rpc('get_my_staff_access'),
  ]);
  if (roleError || accessError) return privateNoStore(apiFail('AUTHORIZATION_UNAVAILABLE', 'Unable to verify staff access', 503));

  type RoleRow = { roles: { name: string } | { name: string }[] | null };
  const roleNames = ((roleRows ?? []) as RoleRow[]).map((row) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return role?.name;
  });
  if (!roleNames.some((name) => ['admin', 'approver', 'staff', 'super_admin'].includes(name ?? ''))) {
    return privateNoStore(apiFail('FORBIDDEN', 'Staff role required', 403));
  }
  if (!staffAccess || typeof staffAccess !== 'object' || Array.isArray(staffAccess)
    || !Array.isArray(staffAccess.permissionKeys)
    || !staffAccess.permissionKeys.every((key: unknown) => typeof key === 'string')) {
    return privateNoStore(apiFail('AUTHORIZATION_UNAVAILABLE', 'Unable to verify staff permissions', 503));
  }

  const permissions = new Set<string>(staffAccess.permissionKeys);
  // An inactive profile has no effective permissions even if its coarse role remains.
  const canReviewSystemContent = permissions.size > 0 && roleNames.some((name) => name === 'admin' || name === 'super_admin');
  const canReviewVendors = permissions.has('admin.vendor.manage');
  const canReviewCatalogue = permissions.has('admin.catalogue.review');
  let canReviewKyc = permissions.has('admin.kyc.review');
  let kycAvailability: QueueAvailability = canReviewKyc ? 'available' : 'forbidden';
  if (dashboardView && canReviewKyc) {
    const { data: claims, error: claimsError } = await authenticated.auth.getClaims();
    if (claimsError || !claims?.claims) {
      canReviewKyc = false;
      kycAvailability = 'unavailable';
    } else if (claims.claims.aal !== 'aal2') {
      canReviewKyc = false;
      kycAvailability = 'forbidden';
    }
  }
  const canReviewWithdrawals = permissions.has('admin.withdrawal.approve');
  const canReviewRecommendations = permissions.has('admin.recommendation.review');
  // The current Admin tickets endpoint requires Super Admin, not a coarse admin role.
  const canReadSupport = permissions.size > 0 && roleNames.includes('super_admin');
  const service = createServiceClient();
  const [vendors, outlets, products, vouchers, kyc, withdrawals, refunds, chatReports, recommendations, support] = await Promise.all([
    canReviewVendors ? service.from('vendors').select('id', { count: 'exact', head: true }).eq('status', 'pending') : null,
    canReviewCatalogue ? service.from('outlets').select('id', { count: 'exact', head: true }).eq('review_status', 'pending_review') : null,
    canReviewCatalogue ? service.from('products').select('id', { count: 'exact', head: true }).eq('review_status', 'pending_review') : null,
    canReviewCatalogue ? service.from('vouchers').select('id', { count: 'exact', head: true }).eq('review_status', 'pending_review').eq('vendor_review_status', 'approved') : null,
    canReviewKyc ? service.from('kyc_submissions').select('id', { count: 'exact', head: true }).in('status', ['pending', 'info_requested']) : null,
    canReviewWithdrawals ? service.from('withdrawal_requests').select('id', { count: 'exact', head: true }).in('status', [...WITHDRAWAL_REVIEW_STATUSES]) : null,
    canReviewSystemContent ? service.from('refunds').select('id', { count: 'exact', head: true }).eq('status', 'pending') : null,
    canReviewSystemContent ? service.from('chat_reports').select('id', { count: 'exact', head: true }).eq('status', 'open') : null,
    canReviewRecommendations ? service.from('vendor_recommendations').select('id', { count: 'exact', head: true }).eq('status', 'pending') : null,
    canReadSupport ? service.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open') : null,
  ]);

  const results: Array<CountResult | null> = [vendors, outlets, products, vouchers, kyc, withdrawals, refunds, chatReports, recommendations, support];
  const failed = results.find((result) => result?.error);
  if (failed?.error && !dashboardView) {
    console.error('[admin-navigation-counts]', failed.error);
    return privateNoStore(apiFail('DB_ERROR', 'Unable to load admin queue counts', 500));
  }

  const data: Record<string, unknown> = {
    ...(vendors && !vendors.error ? { vendors: vendors.count ?? 0 } : {}),
    ...(outlets && products && vouchers && !outlets.error && !products.error && !vouchers.error ? { catalogue: (outlets.count ?? 0) + (products.count ?? 0) + (vouchers.count ?? 0) } : {}),
    ...(kyc && !kyc.error ? { kyc: kyc.count ?? 0 } : {}),
    ...(withdrawals && !withdrawals.error ? { withdrawals: withdrawals.count ?? 0 } : {}),
    ...(refunds && !refunds.error ? { refunds: refunds.count ?? 0 } : {}),
    ...(chatReports && !chatReports.error ? { chatReports: chatReports.count ?? 0 } : {}),
    ...(recommendations && !recommendations.error ? { recommendations: recommendations.count ?? 0 } : {}),
    ...(support && !support.error ? { tickets: support.count ?? 0 } : {}),
  };

  if (dashboardView) {
    let withdrawalAvailability: QueueAvailability = canReviewWithdrawals ? 'available' : 'forbidden';
    let withdrawalSummary: AdminDashboardSummary['queues']['withdrawals'] | null = null;
    if (canReviewWithdrawals) {
      const { data: rawSummary, error } = await service.rpc('get_admin_dashboard_withdrawal_summary', {
        p_as_of: asOf,
        p_review_statuses: [...WITHDRAWAL_REVIEW_STATUSES],
      });
      if (error || !rawSummary || typeof rawSummary !== 'object' || Array.isArray(rawSummary)) {
        // The cause was being dropped, so an unavailable tile gave nothing to diagnose.
        console.error('[admin-queue-summary] withdrawal summary unavailable', error?.message ?? 'unexpected result shape');
        withdrawalAvailability = 'unavailable';
      } else {
        const row = rawSummary as Record<string, unknown>;
        const activity = Array.isArray(row.activity)
          ? row.activity.flatMap((entry) => {
            if (!entry || typeof entry !== 'object') return [];
            const day = (entry as Record<string, unknown>).day;
            const count = (entry as Record<string, unknown>).count;
            const parsedCount = nonNegativeInteger(count);
            return typeof day === 'string' && parsedCount !== null
              ? [{ day, count: parsedCount }]
              : [];
          })
          : null;
        const count = nonNegativeInteger(row.count);
        const amount = finiteAmount(row.amount);
        const overdueCount = nonNegativeInteger(row.overdueCount);
        const dualApprovalCount = nonNegativeInteger(row.dualApprovalCount);
        const hasValidOldest = typeof row.oldestCreatedAt === 'string' || row.oldestCreatedAt === null;
        if (count !== null && amount !== null && overdueCount !== null && dualApprovalCount !== null && hasValidOldest) {
          if (activity && activity.length === 7) {
            withdrawalSummary = {
              availability: 'available', count, amount, overdueCount, dualApprovalCount,
              oldestCreatedAt: row.oldestCreatedAt as string | null, activity,
            };
          }
        }
        if (!withdrawalSummary) {
          console.error('[admin-queue-summary] withdrawal summary had an invalid value or an incomplete 7-day activity list');
          withdrawalAvailability = 'unavailable';
        }
      }
    }
    if (!withdrawalSummary) {
      withdrawalSummary = {
        ...queueCount(withdrawalAvailability, null), amount: null, overdueCount: null,
        dualApprovalCount: null, oldestCreatedAt: null, activity: null,
      };
    }

    const availability = (result: CountResult | null, permitted: boolean): QueueAvailability => {
      if (!permitted) return 'forbidden';
      return result?.error ? 'unavailable' : 'available';
    };
    const summary: AdminDashboardSummary = {
      asOf,
      queues: {
        vendors: queueCount(availability(vendors, canReviewVendors), vendors?.count ?? null),
        kyc: queueCount(kycAvailability === 'unavailable' ? 'unavailable' : availability(kyc, canReviewKyc), kyc?.count ?? null),
        withdrawals: withdrawalSummary,
        recommendations: queueCount(availability(recommendations, canReviewRecommendations), recommendations?.count ?? null),
        support: queueCount(availability(support, canReadSupport), support?.count ?? null),
      },
    };
    data.summary = summary;
  }

  const response = apiOk(data);
  return privateNoStore(response);
}

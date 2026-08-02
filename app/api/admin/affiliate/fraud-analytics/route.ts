// P4 — Member 4: fraud analytics (CLAUDE-P4-EXTRAS.md Extra 2)
// GET /api/admin/affiliate/fraud-analytics?range=7d|30d|all — trends,
// type/severity breakdown, headline stats, and top-flagged affiliates over
// affiliate_fraud_flags. Gated on super_admin/approver, same as every other
// route on this admin page (fraud-flags, fraud-sweep, links).

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { getFraudAnalytics, type FraudAnalyticsRange } from '@/lib/affiliate/fraud-analytics';

const VALID_RANGES: FraudAnalyticsRange[] = ['7d', '30d', 'all'];

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can view fraud analytics', 403);
  }

  const rangeParam = new URL(request.url).searchParams.get('range');
  const range: FraudAnalyticsRange = VALID_RANGES.includes(rangeParam as FraudAnalyticsRange)
    ? (rangeParam as FraudAnalyticsRange)
    : '30d';

  const service = createServiceClient();
  const analytics = await getFraudAnalytics(service, range);
  return apiOk(analytics);
}

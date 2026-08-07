// P4 — Member 4: admin-side affiliate PDF export.
// GET /api/admin/affiliate/report?range=7d|30d|all — a downloadable PDF
// snapshot of the affiliate oversight page (program totals, tiers, top
// earners, fraud guard counters/breakdown, top flagged affiliates,
// attributions). Same three data sources the page itself already fetches
// (getAffiliateAdminStats, getFraudCounters, getFraudAnalytics) — no new
// queries, just a PDF rendering of what's already shown. Gated on
// super_admin/approver, same as every other route on this admin page.
//
// Returns a raw application/pdf Response, not the repo's apiOk() JSON
// envelope — same class of exception as
// app/api/affiliate/earnings-export/route.ts's raw text/csv Response (a
// file download can't be wrapped in a JSON envelope and still trigger a
// browser save-file dialog). Error paths still use apiFail(), matching
// that same precedent.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail } from '@/lib/validation/schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { getAffiliateAdminStats } from '@/lib/affiliate/admin-stats';
import { getFraudCounters } from '@/lib/affiliate/fraud';
import { getFraudAnalytics, type FraudAnalyticsRange } from '@/lib/affiliate/fraud-analytics';
import { generateAffiliateReportPdf } from '@/lib/pdf/affiliate-report';

const VALID_RANGES: FraudAnalyticsRange[] = ['7d', '30d', 'all'];

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can export the affiliate report', 403);
  }

  const rangeParam = new URL(request.url).searchParams.get('range');
  const range: FraudAnalyticsRange = VALID_RANGES.includes(rangeParam as FraudAnalyticsRange)
    ? (rangeParam as FraudAnalyticsRange)
    : '30d';

  const service = createServiceClient();
  const [stats, fraudCounters, fraudAnalytics] = await Promise.all([
    getAffiliateAdminStats(supabase),
    getFraudCounters(service),
    getFraudAnalytics(service, range),
  ]);

  const pdfBuffer = await generateAffiliateReportPdf({
    generatedAt: new Date().toISOString(),
    stats,
    fraudCounters,
    fraudAnalytics,
  });

  const fileName = `mywisata-affiliate-report-${range}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}

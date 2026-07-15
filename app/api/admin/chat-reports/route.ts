import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk } from '@/lib/validation/schemas';

// chat_reports_admin_select RLS already scopes this to admins only — the
// is_admin() check here just turns "empty because not admin" into a clear 403.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: isAdmin } = await supabase.rpc('is_admin', { uid: user.id });
  if (!isAdmin) return apiFail('FORBIDDEN', 'Admin role required', 403);

  const { data, error } = await supabase
    .from('chat_reports')
    .select('id,thread_id,reporter_id,reason,details,status,resolution_reason,resolution_note,resolved_at,created_at,reporter:users!chat_reports_reporter_id_fkey(full_name,email),chat_threads(customer_id,created_at,customer:users!chat_threads_customer_id_fkey(full_name,email),outlets(name))')
    .order('created_at', { ascending: false });
  if (error) return apiFail('DB_ERROR', error.message, 500);

  const reports = data ?? [];

  // Reporter reputation (dismissed vs total) and same-thread crowd-signal are
  // both derivable from this one result set — no second query needed.
  const reporterStats = new Map<string, { total: number; dismissed: number }>();
  const threadReportCounts = new Map<string, number>();
  for (const r of reports) {
    const stats = reporterStats.get(r.reporter_id) ?? { total: 0, dismissed: 0 };
    stats.total += 1;
    if (r.status === 'dismissed') stats.dismissed += 1;
    reporterStats.set(r.reporter_id, stats);
    threadReportCounts.set(r.thread_id, (threadReportCounts.get(r.thread_id) ?? 0) + 1);
  }

  const reporterIds = [...new Set(reports.map((r) => r.reporter_id))];
  const bannedUntilByUser = new Map<string, string>();
  if (reporterIds.length > 0) {
    const { data: bans, error: bansError } = await supabase
      .from('chat_report_bans')
      .select('user_id,banned_until')
      .in('user_id', reporterIds)
      .gt('banned_until', new Date().toISOString());
    if (bansError) return apiFail('DB_ERROR', bansError.message, 500);
    for (const b of bans ?? []) bannedUntilByUser.set(b.user_id, b.banned_until);
  }

  const enriched = reports.map((r) => ({
    ...r,
    reporterStats: reporterStats.get(r.reporter_id) ?? { total: 1, dismissed: 0 },
    sameThreadReportCount: threadReportCounts.get(r.thread_id) ?? 1,
    reporterBannedUntil: bannedUntilByUser.get(r.reporter_id) ?? null,
  }));

  return apiOk(enriched);
}

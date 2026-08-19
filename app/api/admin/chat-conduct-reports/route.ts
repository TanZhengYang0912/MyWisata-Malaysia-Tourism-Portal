// P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 4: reported-chat list.
// GET /api/admin/chat-conduct-reports — every human-submitted chat report,
// newest first. Super-admin only, matching the Flagged Conduct tab's gate
// (spec: "keep it consistent: the panel is super-admin").

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { getChatConductReports } from '@/lib/moderation/chat-conduct-reports';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Chat report review is limited to super admins', 403);
  }

  // chat_conduct_reports has an is_super_admin()-only SELECT policy
  // (migration 20260812010000) — the cookie-aware client is enough here.
  const reports = await getChatConductReports(supabase);
  return apiOk(reports);
}

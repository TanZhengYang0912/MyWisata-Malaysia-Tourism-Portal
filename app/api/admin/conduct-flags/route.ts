// P4 — Member 4: staff conduct flags list. CLAUDE-ADMIN-CONDUCT.md.
// GET /api/admin/conduct-flags — every admin-authored profanity/slur flag,
// newest first. Super-admin only (stricter than moderation_flags' admin/
// approver gate — conduct records about staff are sensitive).

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { getAdminConductFlags } from '@/lib/moderation/admin-conduct';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Staff conduct review is limited to super admins', 403);
  }

  // admin_conduct_flags has an is_super_admin()-only SELECT policy
  // (migration 20260809020000) — the cookie-aware client is enough here.
  const flags = await getAdminConductFlags(supabase);
  return apiOk(flags);
}

// P4 — Member 4: moderation flags list. CLAUDE-MODERATION.md.
// GET /api/admin/moderation/flags — every slur flag across chatbot messages
// and tickets, newest first. Same admin gate as the rest of the support/
// affiliate admin surface.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { getModerationFlags } from '@/lib/moderation/flags';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can view moderation flags', 403);
  }

  // moderation_flags has an is_admin()-only SELECT policy (migration 036) —
  // the cookie-aware client is enough here, same as the affiliate fraud panel.
  const flags = await getModerationFlags(supabase);
  return apiOk(flags);
}

// P4 — Member 4: chatbot admin stats (CLAUDE-PHASE2.md Feature A)
// GET /api/admin/chatbot/stats — total questions, answer rate, top
// unanswered questions. Gated on super_admin, checked server-side.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { getChatbotAdminStats } from '@/lib/chatbot/admin-stats';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can view chatbot stats', 403);
  }

  const service = createServiceClient();
  const daysRaw = new URL(request.url).searchParams.get('days') ?? '30';
  const days = Number(daysRaw);
  if (![7, 30, 90].includes(days)) return apiFail('BAD_REQUEST', 'Choose a 7, 30, or 90 day report range.', 400);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  try {
    return apiOk(await getChatbotAdminStats(service, { from, to }));
  } catch {
    return apiFail('READ_UNAVAILABLE', 'Chatbot report is temporarily unavailable. Try again.', 503);
  }
}

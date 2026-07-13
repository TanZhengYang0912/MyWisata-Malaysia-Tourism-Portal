// P4 — Member 4: chatbot admin stats (CLAUDE-PHASE2.md Feature A)
// GET /api/admin/chatbot/stats — total questions, answer rate, top
// unanswered questions. Gated on super_admin/approver, checked server-side.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { getChatbotAdminStats } from '@/lib/chatbot/admin-stats';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can view chatbot stats', 403);
  }

  const service = createServiceClient();
  const stats = await getChatbotAdminStats(service);
  return apiOk(stats);
}

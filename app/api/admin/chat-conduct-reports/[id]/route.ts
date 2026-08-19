// P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 4: mark a chat report reviewed.
// PATCH /api/admin/chat-conduct-reports/[id] — no body. Super-admin only.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { reviewChatConductReport } from '@/lib/moderation/chat-conduct-reports';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Chat report review is limited to super admins', 403);
  }

  const service = createServiceClient();
  let reviewed: boolean;
  try {
    reviewed = await reviewChatConductReport(service, id, user.id);
  } catch {
    return apiFail('DB_ERROR', 'Unable to update chat report', 500);
  }
  if (!reviewed) return apiFail('NOT_FOUND', 'Chat report not found or already reviewed', 404);

  return apiOk({ id, status: 'reviewed' });
}

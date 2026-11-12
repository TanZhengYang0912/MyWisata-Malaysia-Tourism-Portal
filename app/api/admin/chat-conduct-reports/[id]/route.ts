// P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 4: mark a chat report reviewed.
// PATCH /api/admin/chat-conduct-reports/[id] — no body. Super-admin only.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { reviewChatConductReport } from '@/lib/moderation/chat-conduct-reports';
import { getRequestId } from '@/lib/request-id';
import { getAuthenticatedUser } from '@/lib/auth/request-user';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const authentication = await getAuthenticatedUser(supabase);
  if (authentication.state === 'unauthenticated') return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (authentication.state === 'unavailable') {
    const requestId = getRequestId(request);
    console.error('[admin/chat-conduct-reports] authentication check failed', { requestId });
    return apiFail('READ_UNAVAILABLE', 'Unable to verify your sign-in. Please retry.', 503, undefined, { requestId });
  }
  const { user } = authentication;
  let canReviewReports: boolean;
  try {
    canReviewReports = await isSuperAdmin(supabase, user.id, { throwOnLookupError: true });
  } catch {
    const requestId = getRequestId(request);
    console.error('[admin/chat-conduct-reports] review access check failed', { requestId });
    return apiFail('READ_UNAVAILABLE', 'Unable to verify review access. Please retry.', 503, undefined, { requestId });
  }
  if (!canReviewReports) {
    return apiFail('FORBIDDEN', 'Chat report review is limited to super admins', 403);
  }

  const service = createServiceClient();
  let reviewed: 'reviewed' | 'already_reviewed' | 'not_found';
  try {
    reviewed = await reviewChatConductReport(service, id, user.id);
  } catch {
    return apiFail('DB_ERROR', 'Unable to update chat report', 500);
  }
  if (reviewed === 'not_found') return apiFail('NOT_FOUND', 'Chat report not found', 404);

  return apiOk({ id, status: 'reviewed', alreadyReviewed: reviewed === 'already_reviewed' });
}

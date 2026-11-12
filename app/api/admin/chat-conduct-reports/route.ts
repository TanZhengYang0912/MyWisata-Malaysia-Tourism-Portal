// Compatibility list endpoint kept bounded for any existing external caller.
// The conduct panel uses the unified /api/admin/conduct-queue endpoint.
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { conductQueueQuerySchema, getConductQueue } from '@/lib/moderation/conduct-queue';
import { getRequestId } from '@/lib/request-id';
import { getAuthenticatedUser } from '@/lib/auth/request-user';

export async function GET(request: Request) {
  const supabase = await createClient();
  const authentication = await getAuthenticatedUser(supabase);
  if (authentication.state === 'unauthenticated') return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (authentication.state === 'unavailable') {
    const requestId = getRequestId(request);
    console.error('[admin/chat-conduct-reports] authentication check failed', { requestId });
    return apiFail('QUEUE_UNAVAILABLE', 'Unable to verify your sign-in. Please retry.', 503, undefined, { requestId });
  }
  const { user } = authentication;
  let canReviewReports: boolean;
  try {
    canReviewReports = await isSuperAdmin(supabase, user.id, { throwOnLookupError: true });
  } catch {
    const requestId = getRequestId(request);
    console.error('[admin/chat-conduct-reports] access check failed', { requestId });
    return apiFail('QUEUE_UNAVAILABLE', 'Unable to verify review access. Please retry.', 503, undefined, { requestId });
  }
  if (!canReviewReports) {
    return apiFail('FORBIDDEN', 'Chat report review is limited to super admins', 403);
  }

  const params = new URL(request.url).searchParams;
  const parsed = conductQueueQuerySchema.safeParse({
    ...Object.fromEntries(params),
    reviewState: params.get('reviewState') ?? 'all',
    recordType: 'reported_chat',
  });
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'Invalid conduct queue filters', 422);

  const result = await getConductQueue(createServiceClient(), user.id, parsed.data);
  if (!result.ok) {
    const requestId = getRequestId(request);
    console.error('[admin/chat-conduct-reports] read failed', { requestId, errorCode: result.errorCode });
    return apiFail('QUEUE_UNAVAILABLE', 'Unable to load chat reports. Please retry.', 503, undefined, { requestId });
  }

  const response = apiOk({
    items: result.data.items.flatMap((item) => item.kind === 'reported_chat' ? [item.data] : []),
    total: result.data.total,
    page: result.data.page,
    pageSize: result.data.pageSize,
    totalPages: result.data.totalPages,
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

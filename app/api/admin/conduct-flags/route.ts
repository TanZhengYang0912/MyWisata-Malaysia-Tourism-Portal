// Compatibility list endpoint kept bounded for any existing external caller.
// The conduct panel uses the unified /api/admin/conduct-queue endpoint.
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { conductQueueQuerySchema, getConductQueue } from '@/lib/moderation/conduct-queue';
import { getRequestId } from '@/lib/request-id';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Staff conduct review is limited to super admins', 403);
  }

  const params = new URL(request.url).searchParams;
  const parsed = conductQueueQuerySchema.safeParse({
    ...Object.fromEntries(params),
    reviewState: params.get('reviewState') ?? 'all',
    recordType: 'flagged_conduct',
  });
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'Invalid conduct queue filters', 422);

  const result = await getConductQueue(createServiceClient(), user.id, parsed.data);
  if (!result.ok) {
    const requestId = getRequestId(request);
    console.error('[admin/conduct-flags] read failed', { requestId, errorCode: result.errorCode });
    return apiFail('QUEUE_UNAVAILABLE', 'Unable to load conduct records. Please retry.', 503, undefined, { requestId });
  }

  const response = apiOk({
    items: result.data.items.flatMap((item) => item.kind === 'flagged_conduct' ? [item.data] : []),
    total: result.data.total,
    page: result.data.page,
    pageSize: result.data.pageSize,
    totalPages: result.data.totalPages,
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

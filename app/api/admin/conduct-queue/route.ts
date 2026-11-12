import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { conductQueueQuerySchema, getConductQueue } from '@/lib/moderation/conduct-queue';
import { getRequestId } from '@/lib/request-id';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Conduct review is limited to super admins', 403);
  }

  const parsed = conductQueueQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'Invalid conduct queue filters', 422);

  const result = await getConductQueue(createServiceClient(), user.id, parsed.data);
  if (!result.ok) {
    const requestId = getRequestId(request);
    console.error('[admin/conduct-queue] read failed', { requestId, errorCode: result.errorCode });
    return apiFail('QUEUE_UNAVAILABLE', 'Unable to load conduct reports. Please retry.', 503, undefined, { requestId });
  }

  const response = apiOk(result.data);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

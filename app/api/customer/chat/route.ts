import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { toChatThreadSummaries } from '@/lib/chat/thread-summaries';

type CreateThreadBody = { outletId?: string };

async function getAuthenticatedCustomer() {
  const auth = await createClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) return null;
  return user;
}

// One summary row per thread (latest message, unread count, muted) from
// get_chat_thread_summaries, instead of every message and every read row on
// each 3s poll. The RPC is service-role only; the caller is the signed-in
// customer resolved above.
export async function GET() {
  const user = await getAuthenticatedCustomer();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data, error } = await service.rpc('get_chat_thread_summaries', { p_user_id: user.id });
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ threads: toChatThreadSummaries(data) });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedCustomer();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  let body: CreateThreadBody;
  try {
    body = await request.json() as CreateThreadBody;
  } catch {
    return apiFail('INVALID_BODY', 'outletId is required', 400);
  }
  if (!body.outletId) return apiFail('INVALID_BODY', 'outletId is required', 400);

  const service = createServiceClient();
  const { data: outlet, error: outletError } = await service
    .from('outlets')
    .select('id')
    .eq('id', body.outletId)
    .eq('status', 'active')
    .maybeSingle();
  if (outletError) return apiFail('DB_ERROR', outletError.message, 500);
  if (!outlet) return apiFail('NOT_FOUND', 'Outlet not found', 404);

  const { error: insertError } = await service
    .from('chat_threads')
    .upsert(
      { customer_id: user.id, outlet_id: outlet.id },
      { onConflict: 'customer_id,outlet_id', ignoreDuplicates: true },
    );
  if (insertError) return apiFail('DB_ERROR', insertError.message, 500);

  const { data: thread, error: threadError } = await service
    .from('chat_threads')
    .select('id,customer_id,outlet_id,vendor_id,last_message_at,created_at')
    .eq('customer_id', user.id)
    .eq('outlet_id', outlet.id)
    .single();
  if (threadError) return apiFail('DB_ERROR', threadError.message, 500);

  return apiOk(thread, { status: 201 });
}

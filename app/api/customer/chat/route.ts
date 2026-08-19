import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

type CreateThreadBody = { outletId?: string };

async function getAuthenticatedCustomer() {
  const auth = await createClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function GET() {
  const user = await getAuthenticatedCustomer();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data, error } = await service
    .from('chat_threads')
    .select('id,customer_id,outlet_id,vendor_id,last_message_at,created_at,outlets(id,name,city,state),chat_messages(id,sender_id,body,created_at,attachment_url,reply_to_message_id,context_product_id)')
    .eq('customer_id', user.id)
    .order('last_message_at', { ascending: false });
  if (error) return apiFail('DB_ERROR', error.message, 500);

  const messageIds = (data ?? []).flatMap((thread) => (thread.chat_messages ?? []).map((message) => message.id));
  let readMessageIds: string[] = [];
  if (messageIds.length > 0) {
    const { data: reads, error: readsError } = await service
      .from('chat_message_reads')
      .select('message_id')
      .eq('user_id', user.id)
      .in('message_id', messageIds);
    if (readsError) return apiFail('DB_ERROR', readsError.message, 500);
    readMessageIds = (reads ?? []).map((read) => read.message_id);
  }

  return apiOk({ threads: data ?? [], readMessageIds });
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

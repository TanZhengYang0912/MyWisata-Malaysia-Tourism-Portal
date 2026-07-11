import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

interface Props { params: Promise<{ vendorId: string }> }

async function authorize(vendorId: string) {
  const authDb = await createClient() as any;
  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return { error: apiFail('UNAUTHORIZED', 'Sign in required', 401) };
  const { data: vendor } = await authDb.from('vendors').select('id,owner_id,status').eq('id', vendorId).maybeSingle();
  if (!vendor || vendor.owner_id !== user.id || vendor.status !== 'approved') return { error: apiFail('FORBIDDEN', 'You cannot manage this vendor inbox', 403) };
  return { user, service: createServiceClient() as any };
}

export async function GET(_request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorize(vendorId);
  if ('error' in access) return access.error;
  const { data: outlets, error: outletError } = await access.service.from('outlets').select('id').eq('vendor_id', vendorId);
  if (outletError) return apiFail('DB_ERROR', outletError.message, 500);
  const outletIds = (outlets || []).map((outlet: { id: string }) => outlet.id);
  if (!outletIds.length) return apiOk([]);
  const { data, error } = await access.service.from('chat_threads').select('id,customer_id,outlet_id,status,last_message_at,created_at,customer:users!chat_threads_customer_id_fkey(full_name,email),outlets(name),chat_messages(id,sender_id,body,created_at)').in('outlet_id', outletIds).order('last_message_at', { ascending: false });
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(data || []);
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorize(vendorId);
  if ('error' in access) return access.error;
  let body: { threadId?: string; body?: string } = {};
  try { body = await request.json(); } catch { return apiFail('INVALID_BODY', 'Message body is required', 400); }
  if (!body.threadId || !body.body?.trim()) return apiFail('INVALID_BODY', 'Message body is required', 400);

  const { data: thread } = await access.service.from('chat_threads').select('id,outlet_id').eq('id', body.threadId).maybeSingle();
  if (!thread) return apiFail('NOT_FOUND', 'Conversation not found', 404);
  const { data: outlet } = await access.service.from('outlets').select('id').eq('id', thread.outlet_id).eq('vendor_id', vendorId).maybeSingle();
  if (!outlet) return apiFail('FORBIDDEN', 'Conversation is outside this vendor', 403);

  const { data: message, error } = await access.service.from('chat_messages').insert({ thread_id: thread.id, sender_id: access.user.id, body: body.body.trim() }).select().single();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  await access.service.from('chat_threads').update({ last_message_at: new Date().toISOString() }).eq('id', thread.id);
  return apiOk(message, { status: 201 });
}

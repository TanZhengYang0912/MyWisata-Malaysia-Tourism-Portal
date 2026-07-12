import { apiFail, apiOk } from '@/lib/validation/schemas';
import { outletShortName } from '@/lib/outlet-display';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string }> }

async function authorize(vendorId: string) {
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return { error: access.response };
  return { user: { id: access.access.userId }, service: access.access.serviceDb, outletIds: access.access.outletIds };
}

export async function GET(_request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorize(vendorId);
  if ('error' in access) return access.error;
  const outletIds = access.outletIds;
  if (!outletIds.length) return apiOk([]);
  const { data, error } = await access.service.from('chat_threads').select('id,customer_id,outlet_id,status,last_message_at,created_at,customer:users!chat_threads_customer_id_fkey(full_name,email),outlets(id,name,city,state),chat_messages(id,sender_id,body,created_at)').in('outlet_id', outletIds).order('last_message_at', { ascending: false });
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk((data || []).map((thread: any) => ({ ...thread, outlets: thread.outlets ? { ...thread.outlets, full_name: thread.outlets.name, name: outletShortName(thread.outlets.name) } : thread.outlets })));
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
  const { data: outlet } = await access.service.from('outlets').select('id').eq('id', thread.outlet_id).eq('vendor_id', vendorId).in('id', access.outletIds).maybeSingle();
  if (!outlet) return apiFail('FORBIDDEN', 'Conversation is outside this vendor', 403);

  const { data: message, error } = await access.service.from('chat_messages').insert({ thread_id: thread.id, sender_id: access.user.id, body: body.body.trim() }).select().single();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  await access.service.from('chat_threads').update({ last_message_at: new Date().toISOString() }).eq('id', thread.id);
  return apiOk(message, { status: 201 });
}

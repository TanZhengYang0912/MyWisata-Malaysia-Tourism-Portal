import { apiFail, apiOk } from '@/lib/validation/schemas';
import { outletShortName } from '@/lib/outlet-display';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { maskChatBody } from '@/lib/chat/moderation';
import { buildOrderContextSnapshot } from '@/lib/chat/context';
import { notifyNewChatMessage } from '@/lib/chat/notify';

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
  const { data, error } = await access.service.from('chat_threads').select('id,customer_id,outlet_id,status,last_message_at,created_at,customer:users!chat_threads_customer_id_fkey(full_name,email),outlets(id,name,city,state),chat_messages(id,sender_id,body,created_at,attachment_url,reply_to_message_id,context_product_id,context_snapshot)').in('outlet_id', outletIds).order('last_message_at', { ascending: false });
  if (error) return apiFail('DB_ERROR', error.message, 500);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return apiOk((data || []).map((thread: any) => ({ ...thread, outlets: thread.outlets ? { ...thread.outlets, full_name: thread.outlets.name, name: outletShortName(thread.outlets.name) } : thread.outlets })));
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorize(vendorId);
  if ('error' in access) return access.error;
  let body: { threadId?: string; body?: string; replyToId?: string; contextOrderId?: string } = {};
  try { body = await request.json(); } catch { return apiFail('INVALID_BODY', 'Message body is required', 400); }
  if (!body.threadId) return apiFail('INVALID_BODY', 'Message body is required', 400);
  // An order-context card is a valid message on its own; a plain message still needs text.
  if (!body.body?.trim() && !body.contextOrderId) return apiFail('INVALID_BODY', 'Message body is required', 400);

  const { data: thread } = await access.service.from('chat_threads').select('id,outlet_id,customer_id').eq('id', body.threadId).maybeSingle();
  if (!thread) return apiFail('NOT_FOUND', 'Conversation not found', 404);
  const { data: outlet } = await access.service.from('outlets').select('id').eq('id', thread.outlet_id).eq('vendor_id', vendorId).in('id', access.outletIds).maybeSingle();
  if (!outlet) return apiFail('FORBIDDEN', 'Conversation is outside this vendor', 403);

  const context = body.contextOrderId
    ? await buildOrderContextSnapshot(access.service, body.contextOrderId, thread.customer_id, access.outletIds)
    : null;
  if (body.contextOrderId && !context) return apiFail('NOT_FOUND', "That order isn't this customer's", 404);

  const { clean } = maskChatBody((body.body ?? '').trim());
  const { data: message, error } = await access.service.from('chat_messages').insert({
    thread_id: thread.id,
    sender_id: access.user.id,
    body: clean,
    reply_to_message_id: body.replyToId ?? null,
    context_order_id: context ? body.contextOrderId : null,
    context_snapshot: context,
  }).select().single();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  await access.service.from('chat_threads').update({ last_message_at: new Date().toISOString() }).eq('id', thread.id);
  // Reopen an archived thread on new activity; never override a manually 'closed' one.
  await access.service.from('chat_threads').update({ status: 'open' }).eq('id', thread.id).eq('status', 'archived');
  // Notify the customer. Vendor-team awareness is covered by the inbox's own
  // realtime unread badges, so this no longer fans out to the vendor team.
  await notifyNewChatMessage(access.service, {
    threadId: thread.id, senderId: access.user.id, senderRole: 'vendor',
    customerId: thread.customer_id, vendorId, outletId: thread.outlet_id,
    preview: clean || null,
  });
  return apiOk(message, { status: 201 });
}

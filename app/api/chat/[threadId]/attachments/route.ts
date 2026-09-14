import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { buildChatAttachmentPath, validateChatAttachment } from '@/lib/chat/attachment';
import { maskChatBody } from '@/lib/chat/moderation';
import { accessibleChatThreadIds } from '@/lib/chat/authorization';
import { notifyNewChatMessage } from '@/lib/chat/notify';

interface Props {
  params: Promise<{ threadId: string }>;
}

async function requireParticipant(threadId: string) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: apiFail('UNAUTHORIZED', 'Sign in required', 401) };

  const { data: thread, error } = await authClient.from('chat_threads').select('id,customer_id,outlet_id,vendor_id').eq('id', threadId).maybeSingle();
  if (error) return { error: apiFail('DB_ERROR', error.message, 500) };
  if (!thread) return { error: apiFail('NOT_FOUND', 'Conversation not found', 404) };
  if (!(await accessibleChatThreadIds(authClient, user.id, [thread])).has(thread.id)) {
    return { error: apiFail('FORBIDDEN', 'Not a participant in this conversation', 403) };
  }

  return { user, thread };
}

export async function POST(request: Request, { params }: Props) {
  const { threadId } = await params;
  const access = await requireParticipant(threadId);
  if ('error' in access) return access.error;

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return apiFail('INVALID_FORM', 'Could not parse form data', 400); }

  const file = formData.get('file');
  if (!(file instanceof File)) return apiFail('MISSING_FILE', 'file is required', 422);

  const validated = await validateChatAttachment(file);
  if (!validated.ok) {
    return apiFail(validated.code, 'File must be a JPEG, PNG, WEBP, or PDF under 10 MB', 422);
  }

  const rawCaption = (formData.get('caption') as string | null)?.trim() ?? '';
  const caption = maskChatBody(rawCaption).clean;
  const replyToId = (formData.get('replyToId') as string | null) || null;

  const path = buildChatAttachmentPath(threadId, crypto.randomUUID(), file.type);
  const service = createServiceClient();
  const upload = await service.storage.from('chat-attachments').upload(path, validated.buffer, { contentType: file.type, upsert: false });
  if (upload.error) return apiFail('UPLOAD_FAILED', 'Unable to upload attachment', 502);

  const { data: message, error: insertError } = await service
    .from('chat_messages')
    .insert({ thread_id: threadId, sender_id: access.user.id, body: caption, attachment_url: path, reply_to_message_id: replyToId })
    .select('*')
    .single();
  if (insertError) {
    await service.storage.from('chat-attachments').remove([path]);
    return apiFail('DB_ERROR', insertError.message, 500);
  }
  await service.from('chat_threads').update({ last_message_at: message.created_at }).eq('id', threadId);
  await notifyNewChatMessage(service, {
    threadId,
    senderId: access.user.id,
    senderRole: access.user.id === access.thread.customer_id ? 'customer' : 'vendor',
    customerId: access.thread.customer_id,
    vendorId: (access.thread as { vendor_id?: string | null }).vendor_id ?? null,
    outletId: access.thread.outlet_id,
    preview: caption || null,
  });

  const signed = await service.storage.from('chat-attachments').createSignedUrl(path, 300);

  return apiOk({
    id: message.id,
    threadId: message.thread_id,
    senderId: message.sender_id,
    senderRole: message.sender_id === access.thread.customer_id ? 'customer' : 'vendor',
    text: message.body,
    sentAt: message.created_at,
    attachmentUrl: message.attachment_url,
    replyToId: message.reply_to_message_id ?? undefined,
    signedUrl: signed.data?.signedUrl ?? null,
  }, { status: 201 });
}

export async function GET(request: Request, { params }: Props) {
  const { threadId } = await params;
  const access = await requireParticipant(threadId);
  if ('error' in access) return access.error;

  const path = new URL(request.url).searchParams.get('path');
  if (!path || !path.startsWith(`${threadId}/`)) return apiFail('NOT_FOUND', 'Attachment not found', 404);

  const service = createServiceClient();
  const signed = await service.storage.from('chat-attachments').createSignedUrl(path, 300);
  if (signed.error || !signed.data?.signedUrl) return apiFail('ATTACHMENT_UNAVAILABLE', 'Attachment is temporarily unavailable', 500);

  return apiOk({ signedUrl: signed.data.signedUrl, expiresIn: 300 });
}

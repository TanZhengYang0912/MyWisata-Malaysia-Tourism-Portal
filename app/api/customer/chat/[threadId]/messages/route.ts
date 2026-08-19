import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { maskChatBody } from '@/lib/chat/moderation';
import { apiFail, apiOk } from '@/lib/validation/schemas';

interface Props { params: Promise<{ threadId: string }> }
type MessageBody = { body?: string; replyToId?: string; contextProductId?: string };

export async function POST(request: Request, { params }: Props) {
  const { threadId } = await params;
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  let body: MessageBody;
  try {
    body = await request.json() as MessageBody;
  } catch {
    return apiFail('INVALID_BODY', 'Message body is required', 400);
  }
  const cleanBody = body.body?.trim();
  if (!cleanBody) return apiFail('INVALID_BODY', 'Message body is required', 400);

  const service = createServiceClient();
  const { data: thread, error: threadError } = await service
    .from('chat_threads')
    .select('id,customer_id')
    .eq('id', threadId)
    .eq('customer_id', user.id)
    .maybeSingle();
  if (threadError) return apiFail('DB_ERROR', threadError.message, 500);
  if (!thread) return apiFail('NOT_FOUND', 'Conversation not found', 404);

  const { clean } = maskChatBody(cleanBody);
  const { data: message, error: messageError } = await service
    .from('chat_messages')
    .insert({ thread_id: thread.id, sender_id: user.id, body: clean, reply_to_message_id: body.replyToId ?? null, context_product_id: body.contextProductId ?? null })
    .select('id,thread_id,sender_id,body,created_at,attachment_url,reply_to_message_id,context_product_id')
    .single();
  if (messageError) return apiFail('DB_ERROR', messageError.message, 500);

  await service.from('chat_threads').update({ last_message_at: message.created_at, status: 'open' }).eq('id', thread.id);
  return apiOk(message, { status: 201 });
}

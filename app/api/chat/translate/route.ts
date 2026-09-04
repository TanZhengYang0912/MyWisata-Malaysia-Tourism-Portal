// P4 — CLAUDE-CAMPAIGN-CLEARING-TRANSLATE.md Feature 3: on-demand
// per-message chat translation. POST /api/chat/translate — takes a
// messageId (not raw text) so the server, not the client, decides what gets
// translated and cached; the client can't spoof a different message's text
// into the cache, and a re-tap of the same message+language always hits the
// same cache key regardless of who taps it.
//
// Permission check mirrors app/api/chat/[threadId]/read/route.ts exactly:
// resolve the message's thread via the service client, then confirm the
// caller can see that thread under RLS (chat_threads_participant) via the
// cookie-aware client — the same "customer, vendor owner, outlet manager, or
// admin" boundary every other chat sub-resource uses.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail, parseBody } from '@/lib/validation/schemas';
import { z } from 'zod';
import { translateMessage } from '@/lib/chat/translate';
import { accessibleChatThreadIds } from '@/lib/chat/authorization';

const chatTranslateSchema = z.object({
  messageId: z.string().uuid(),
  targetLang: z.enum(['en', 'bm', 'zh']),
}).strict();

export async function POST(request: Request) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, chatTranslateSchema);
  if (!parsed.ok) return parsed.response;
  const { messageId, targetLang } = parsed.data;

  const service = createServiceClient();

  const { data: message, error: messageError } = await service
    .from('chat_messages')
    .select('id, thread_id, body')
    .eq('id', messageId)
    .maybeSingle();
  if (messageError) return apiFail('DB_ERROR', messageError.message, 500);
  if (!message || !message.body) return apiFail('NOT_FOUND', 'Message not found', 404);

  // chat_threads_participant RLS scopes this to threads the caller can
  // actually see — a miss means not a participant (or the message/thread
  // doesn't exist), same 403 either way, no extra information leaked.
  const { data: thread, error: threadError } = await authClient
    .from('chat_threads')
    .select('id,customer_id,outlet_id')
    .eq('id', message.thread_id)
    .maybeSingle();
  if (threadError) return apiFail('DB_ERROR', threadError.message, 500);
  if (!thread) return apiFail('FORBIDDEN', 'Not a participant in this conversation', 403);
  if (!(await accessibleChatThreadIds(authClient, user.id, [thread])).has(thread.id)) {
    return apiFail('FORBIDDEN', 'Not a participant in this conversation', 403);
  }

  // Cache first — a message's text is immutable once sent, so a
  // (messageId, targetLang) pair only ever needs the LLM call once.
  const { data: cached, error: cacheError } = await service
    .from('chat_message_translations')
    .select('translated_text')
    .eq('message_id', messageId)
    .eq('target_lang', targetLang)
    .maybeSingle();
  if (cacheError) return apiFail('DB_ERROR', cacheError.message, 500);
  if (cached) return apiOk({ translatedText: cached.translated_text, cached: true });

  let translatedText: string;
  try {
    translatedText = await translateMessage(message.body, targetLang);
  } catch (err) {
    console.error('[chat/translate] translation failed', err instanceof Error ? err.message : err);
    return apiFail('TRANSLATE_FAILED', "Couldn't translate this message. Please try again.", 502);
  }

  // Best-effort cache write — onConflict handles a race between two taps
  // (either side of the thread translating the same message at once).
  // A caching failure must not fail the translate action itself; the user
  // already has their translation.
  const { error: insertError } = await service
    .from('chat_message_translations')
    .upsert({ message_id: messageId, target_lang: targetLang, translated_text: translatedText }, { onConflict: 'message_id,target_lang' });
  if (insertError) {
    console.error('[chat/translate] cache write failed', insertError.message);
  }

  return apiOk({ translatedText, cached: false });
}

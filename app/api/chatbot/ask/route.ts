// P4 — Member 4: FAQ chatbot
// POST /api/chatbot/ask — body { sessionKey?, question }. See CLAUDE.md Step 7.
//
// chatbot_sessions/chatbot_messages have RLS enabled with SELECT-only
// policies (own-or-guest) — no INSERT policy exists on either table
// (007_public_read_policies.sql), so writes need the service-role client,
// same pattern as orders/order_items (CLAUDE.md Section 2/Section 6).

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { chatbotAskSchema } from '@/lib/validation/chatbot-schemas';
import { answerQuestion, type KbDoc } from '@/lib/chatbot/match';

const FALLBACK_ANSWER = "Sorry, I don't know that one. Would you like our team to help?";

export async function POST(request: Request) {
  const parsed = await parseBody(request, chatbotAskSchema);
  if (!parsed.ok) return parsed.response;
  const { sessionKey, question } = parsed.data;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const service = createServiceClient();

  let session: { id: string; session_key: string } | null = null;
  if (sessionKey) {
    const { data } = await service
      .from('chatbot_sessions')
      .select('id, session_key')
      .eq('session_key', sessionKey)
      .maybeSingle();
    session = data ?? null;
  }
  if (!session) {
    const { data: created, error: createErr } = await service
      .from('chatbot_sessions')
      .insert({ user_id: user?.id ?? null, session_key: sessionKey ?? crypto.randomUUID() })
      .select('id, session_key')
      .single();
    if (createErr) return apiFail('DB_ERROR', createErr.message, 500);
    session = created;
  }

  const { error: userMsgErr } = await service
    .from('chatbot_messages')
    .insert({ session_id: session.id, role: 'user', body: question });
  if (userMsgErr) return apiFail('DB_ERROR', userMsgErr.message, 500);

  const { data: kbRows, error: kbErr } = await service
    .from('chatbot_kb_documents')
    .select('id, title, body, keywords, category')
    .eq('is_active', true);
  if (kbErr) return apiFail('DB_ERROR', kbErr.message, 500);

  const docs: KbDoc[] = (kbRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    keywords: row.keywords ?? [],
    category: row.category,
  }));

  const match = answerQuestion(question, docs);
  const answer = match ? match.body : FALLBACK_ANSWER;
  const canEscalate = !match;

  const { error: botMsgErr } = await service.from('chatbot_messages').insert({
    session_id: session.id,
    role: 'bot',
    body: answer,
    kb_matched: Boolean(match),
  });
  if (botMsgErr) return apiFail('DB_ERROR', botMsgErr.message, 500);

  return apiOk({ sessionKey: session.session_key, answer, canEscalate });
}

// P4 — Member 4: ticket escalation
// POST /api/support/tickets — body { sessionKey?, subject, body }. See
// CLAUDE.md Step 8.
//
// support_tickets has real RLS policies (support_own_or_admin SELECT,
// support_insert_own INSERT WITH CHECK user_id = auth.uid() OR NULL —
// 007_public_read_policies.sql), and chatbot_sessions' SELECT policy
// (user_id = auth.uid() OR user_id IS NULL) covers reading a session back
// to link session_id — so unlike Step 7, this route needs no service-role
// client. Guest ticket submission is intentionally allowed by the schema
// (user_id nullable, RLS explicitly permits NULL), so this doesn't require
// login the way affiliate link creation does.

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { supportTicketSchema } from '@/lib/validation/chatbot-schemas';
import { classifyTicket } from '@/lib/chatbot/classify';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const parsed = await parseBody(request, supportTicketSchema);
  if (!parsed.ok) return parsed.response;
  const { sessionKey, subject, body } = parsed.data;

  let sessionId: string | null = null;
  if (sessionKey) {
    const { data: session } = await supabase
      .from('chatbot_sessions')
      .select('id')
      .eq('session_key', sessionKey)
      .maybeSingle();
    sessionId = session?.id ?? null;
  }

  const category = classifyTicket(`${subject} ${body}`);

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: user?.id ?? null,
      session_id: sessionId,
      subject,
      body,
      category,
      status: 'open',
    })
    .select('id')
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ id: data.id, category }, { status: 201 });
}

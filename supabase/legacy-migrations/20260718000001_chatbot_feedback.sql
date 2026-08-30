-- P4 — Member 4: CLAUDE-CHATBOT-FEEDBACK.md — customer-controlled feedback
-- + opt-in escalation. Additive only.
--
-- One feedback row per bot message (never per click) — the API upserts on
-- message_id: the first Yes/No (or the automatic "couldn't answer" record)
-- inserts the row; a later "Yes, open a ticket" updates the same row's
-- opened_ticket rather than creating a second one.

CREATE TABLE IF NOT EXISTS chatbot_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES chatbot_sessions(id) ON DELETE CASCADE,
  message_id    UUID UNIQUE REFERENCES chatbot_messages(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id),
  question      TEXT,
  bot_answered  BOOLEAN NOT NULL,
  helpful       BOOLEAN,
  opened_ticket BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_feedback_session_id ON chatbot_feedback(session_id);

ALTER TABLE chatbot_feedback ENABLE ROW LEVEL SECURITY;

-- Same shape as chatbot_sessions_own/chatbot_messages_own (007_public_read_policies.sql):
-- own-or-guest-owned rows, or admin. No INSERT/UPDATE policy — writes go
-- through POST /api/chatbot/feedback's service-role client, same reason as
-- chatbot_messages (anon has SELECT-only via migration 006's grant, not INSERT).
DROP POLICY IF EXISTS chatbot_feedback_own ON chatbot_feedback;
CREATE POLICY chatbot_feedback_own ON chatbot_feedback
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL OR is_admin(auth.uid()));

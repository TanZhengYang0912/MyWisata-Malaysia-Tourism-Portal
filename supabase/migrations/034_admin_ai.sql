-- P4 — Admin Chatbot (§7.1) + PII Compliance (§7.3). See CLAUDE-ADMIN-AI.md.
-- Additive only.

-- Part 1: log whether redactPII() found anything in a message, without
-- storing the PII itself. Set on the user's message row (the one that
-- could actually contain PII) by app/api/chatbot/ask/route.ts and the new
-- admin-ai ask route.
ALTER TABLE chatbot_messages
  ADD COLUMN IF NOT EXISTS pii_detected BOOLEAN NOT NULL DEFAULT FALSE;

-- Part 2: separate admin-bot conversations from customer ones in the same
-- tables, rather than a new admin_ai_messages table — chatbot_sessions/
-- chatbot_messages already have everything (session_key, role, kb_matched,
-- now pii_detected) an admin conversation needs; a channel column is the
-- smaller additive change.
ALTER TABLE chatbot_sessions
  ADD COLUMN IF NOT EXISTS channel VARCHAR(10) NOT NULL DEFAULT 'customer'
    CHECK (channel IN ('customer', 'admin'));

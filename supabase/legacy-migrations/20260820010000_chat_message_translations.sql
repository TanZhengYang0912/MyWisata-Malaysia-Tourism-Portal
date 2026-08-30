-- P4: CLAUDE-CAMPAIGN-CLEARING-TRANSLATE.md Feature 3 — per-message chat
-- translation cache. A message's text is immutable once sent, so a
-- (message_id, target_lang) pair only ever needs translating once.
--
-- RLS policy mirrors chat_message_deliveries' chat_deliveries_participant
-- policy exactly (20260716000104) — any real participant in the message's
-- thread (customer, vendor owner, outlet manager, admin) can read cached
-- translations directly. Writes always go through the API route's
-- service-role client, after that same participant check.

CREATE TABLE IF NOT EXISTS chat_message_translations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  target_lang     VARCHAR(5) NOT NULL,
  translated_text TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_translations_message
  ON chat_message_translations (message_id);

ALTER TABLE chat_message_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_message_translations_participant ON chat_message_translations
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM chat_messages m
    JOIN chat_threads t ON t.id = m.thread_id
    WHERE m.id = chat_message_translations.message_id
      AND (
        t.customer_id = auth.uid()
        OR is_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM outlets o JOIN vendors v ON v.id = o.vendor_id
          WHERE o.id = t.outlet_id AND v.owner_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM outlet_managers om
          WHERE om.outlet_id = t.outlet_id AND om.user_id = auth.uid()
        )
      )
  )
);

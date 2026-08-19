-- P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 2: per-user, per-thread mute
-- for the vendor<->user chat. Confirmed real table names first: chat_threads
-- (customer_id, outlet_id), chat_messages — no "conversations" table exists.
--
-- Participant-insert check copied verbatim from chat_reports_insert
-- (migration 043) — same three ways to be "in" a chat_threads row (the
-- customer, the outlet's vendor owner, or an outlet manager), reused rather
-- than re-derived so this doesn't drift from the existing definition of
-- "participant" for this table.
--
-- RLS alone is sufficient here (no service-role client needed by the API
-- routes): a mute row only ever affects the muting user's own notifications,
-- never anyone else's data or the thread's content, so there's no case (like
-- admin_conduct_flags) where a participant needs to see/change more than
-- their own row.

CREATE TABLE IF NOT EXISTS chat_thread_mutes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_thread_mutes_user ON chat_thread_mutes(user_id);

ALTER TABLE chat_thread_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_thread_mutes_own_select ON chat_thread_mutes;
CREATE POLICY chat_thread_mutes_own_select ON chat_thread_mutes
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_thread_mutes_own_insert ON chat_thread_mutes;
CREATE POLICY chat_thread_mutes_own_insert ON chat_thread_mutes
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM chat_threads t
    WHERE t.id = chat_thread_mutes.thread_id
      AND (
        t.customer_id = auth.uid()
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

DROP POLICY IF EXISTS chat_thread_mutes_own_delete ON chat_thread_mutes;
CREATE POLICY chat_thread_mutes_own_delete ON chat_thread_mutes
FOR DELETE
USING (user_id = auth.uid());

-- No UPDATE policy — a mute is a row's presence/absence, never edited in place.

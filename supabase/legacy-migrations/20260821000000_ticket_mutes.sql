-- P4 — support ticket mute (user side): per-user, per-ticket notification
-- mute, same shape as chat_thread_mutes (20260813000000) but scoped to the
-- ticket owner only — unlike a chat thread (customer/vendor/outlet-manager
-- can all be "participants"), a support ticket only has one non-admin
-- participant, so the insert check is a straight owner match rather than an
-- OR of several participant shapes.

CREATE TABLE IF NOT EXISTS ticket_mutes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticket_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_mutes_user ON ticket_mutes(user_id);

ALTER TABLE ticket_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_mutes_own_select ON ticket_mutes;
CREATE POLICY ticket_mutes_own_select ON ticket_mutes
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS ticket_mutes_own_insert ON ticket_mutes;
CREATE POLICY ticket_mutes_own_insert ON ticket_mutes
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM support_tickets t
    WHERE t.id = ticket_mutes.ticket_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS ticket_mutes_own_delete ON ticket_mutes;
CREATE POLICY ticket_mutes_own_delete ON ticket_mutes
FOR DELETE
USING (user_id = auth.uid());

-- No UPDATE policy — a mute is a row's presence/absence, never edited in place.

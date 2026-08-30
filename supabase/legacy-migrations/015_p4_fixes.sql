-- ============================================================
-- Migration 015 — P4 fixes (CLAUDE-FIXES.md)
-- Owner: Member 4 (Affiliate, Sharing & AI Support)
--
-- Separate file from 014_p4_depth.sql on purpose: that file is scoped to
-- CLAUDE-PHASE2.md's four depth features (D/B/C/A) per its own header;
-- CLAUDE-FIXES.md is a distinct follow-up spec (bug fixes surfaced by live
-- testing), not another depth feature. Next free number per the same
-- "check the folder, don't trust what a doc says" rule every prior
-- migration in this module has followed.
--
-- Additive only.
-- ============================================================

-- ── Fix 2: ticket replies ────────────────────────────────────
--
-- Matches CLAUDE-FIXES.md's own table definition as written — checked
-- against the real support_tickets/users schema (001_initial_schema.sql)
-- and it lines up exactly, no adaptation needed here (unlike most prior
-- migrations in this module).
CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id),
  sender_role VARCHAR(10) NOT NULL CHECK (sender_role IN ('customer','admin')),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_replies_ticket ON support_ticket_replies(ticket_id);

ALTER TABLE support_ticket_replies ENABLE ROW LEVEL SECURITY;

-- The ticket owner sees their own thread; admins see all. No INSERT policy
-- — every write in this module goes through the service-role client after
-- an explicit server-side permission check (same pattern as every other
-- table added across 011/012/014), so a client-side INSERT policy isn't
-- needed and would just be an extra thing to keep in sync with the route's
-- own sender_role logic.
DROP POLICY IF EXISTS ticket_replies_own_or_admin ON support_ticket_replies;
CREATE POLICY ticket_replies_own_or_admin ON support_ticket_replies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_ticket_replies.ticket_id AND t.user_id = auth.uid()
    )
    OR is_admin(auth.uid())
  );

-- So both sides can sort/show "last activity" — set by the reply route on
-- every new reply.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;

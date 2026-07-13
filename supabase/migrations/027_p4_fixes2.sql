-- ============================================================
-- Migration 027 — P4 fixes round 2 (CLAUDE-FIXES-2.md)
-- Owner: Member 4 (Affiliate, Sharing & AI Support)
--
-- Built incrementally across CLAUDE-FIXES-2.md's items, same as
-- 014/015 — each section appended as its item gets built, not all
-- upfront, so testing stays incremental.
--
-- Numbered 027, not 016: this file was built and applied to the live
-- project as "016_p4_fixes2.sql" while still unpushed. A `git pull` then
-- brought in a wave of teammate migrations occupying every number from
-- 009 through 026 (including a real collision at 016 —
-- 016_customer_activity_realtime.sql and 016_reward_final.sql both landed
-- on the same prefix). Since this file was never pushed or committed,
-- renumbering it is safe — same policy as every prior collision in this
-- module: only renumber your OWN not-yet-shared files, never something
-- already pushed. 027 is the next free number past the highest one in use
-- (025 plain, 026 timestamp-prefixed). This does not change anything the
-- file actually does — it was already applied live under the 016 name
-- before this rename, and Supabase/PostgREST track migrations by full
-- filename, not numeric prefix, so nothing mechanical breaks either way.
--
-- Additive only.
-- ============================================================

-- ── Item 5: lock resolved tickets + reopen ───────────────────
-- last_reply_at already exists (015_p4_fixes.sql) — not re-added here.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;

-- ── Item 1: unread indicators ─────────────────────────────────
-- Per-side read markers, not a separate unread table (per the doc's own
-- design): unread = a reply from the OTHER side newer than MY last-read
-- timestamp. admin_last_read_at is a single shared column, not per-admin —
-- once any admin opens the ticket, it's read for the admin side
-- collectively, matching how a shared support queue actually works.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS customer_last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_last_read_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tickets_last_reply ON support_tickets(last_reply_at DESC);

-- ── Item 6: AI ticket classification ──────────────────────────
-- ⚠️ support_tickets.category (migration 011) is `VARCHAR(30) NOT NULL
-- DEFAULT 'general'` — no CHECK constraint at all. The doc asked to
-- "confirm the CHECK/values allow" the six categories; there is no CHECK to
-- confirm against, only the TypeScript TicketCategory union enforcing it
-- app-side. Not adding one now — a new constraint risks breaking on
-- whatever's already in the live category column, and nobody asked for
-- that hardening specifically.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS classification_method VARCHAR(10);

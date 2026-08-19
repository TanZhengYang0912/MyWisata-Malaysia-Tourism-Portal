-- P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 4: the "Reported Chat" category's
-- storage. A separate table from admin_conduct_flags (not an added `category`
-- column on it) for the same reason moderation_flags and admin_conduct_flags
-- were already kept separate (see that table's own migration comment): a
-- system-detected admin-profanity incident and a human-submitted chat report
-- have almost no columns in common (flagged_admin_id/target_user_id/
-- original_text/severity vs. reporter_id/two parties/chat_type/reason), so a
-- single polymorphic table would mean mostly-null columns and a CHECK
-- constraint doing double duty as a schema. The conduct panel (Feature 4)
-- reads both tables and presents them as two tabs of one UI instead.
--
-- Deliberately NOT touching admin_conduct_flags (migration 20260812000000) —
-- that table's append-only guarantee (RLS + column GRANTs + triggers) was
-- just built and verified live; there is no reason for this feature to touch
-- it at all.
--
-- Scope note: chat_type covers three surfaces per the spec (user_vendor,
-- user_admin, vendor_admin), but only user_vendor (chat_threads) and
-- user_admin (support_tickets) have a real chat surface to report today — no
-- vendor<->admin channel exists anywhere in this codebase. The CHECK
-- constraint still allows 'vendor_admin' for forward compatibility, but
-- POST /api/conduct/report rejects it until that surface exists; no row with
-- chat_type='vendor_admin' can exist yet.
--
-- Also worth flagging (not fixed here, not this feature's job): a teammate's
-- existing chat_reports + chat_report_bans tables (migrations 043-045) and
-- /admin/chat-reports page already provide reporter-reputation-aware
-- moderation SPECIFICALLY for user<->vendor chat. This table does not read
-- from or write to chat_reports — it's a parallel, lighter-weight rollup for
-- the cross-cutting super-admin conduct panel. Whether Feature 3's user<->
-- vendor report button should call this table's endpoint, the existing
-- chat_reports endpoint, or both, is an open product decision, not resolved
-- here.
--
-- Governance level: RLS only (super-admin read, no authenticated-role write
-- policy — inserts/reviews go through the service-role client after a
-- server-side permission check, same pattern moderation_flags and the
-- original pre-hardening admin_conduct_flags used). NOT given the triple-
-- layer (RLS + column GRANTs + triggers) append-only treatment
-- admin_conduct_flags now has — that was a deliberate, separately-reviewed
-- hardening step for staff-misconduct evidence specifically. The same
-- treatment can be applied here on request; flagging it rather than silently
-- assuming it's wanted.

CREATE TABLE IF NOT EXISTS chat_conduct_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL REFERENCES users(id),
  party_a_id   UUID NOT NULL REFERENCES users(id),
  party_b_id   UUID REFERENCES users(id),
  chat_type    VARCHAR(20) NOT NULL CHECK (chat_type IN ('user_vendor', 'user_admin', 'vendor_admin')),
  thread_ref   TEXT NOT NULL,
  reason       TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_chat_conduct_reports_status ON chat_conduct_reports(status);
CREATE INDEX IF NOT EXISTS idx_chat_conduct_reports_thread ON chat_conduct_reports(chat_type, thread_ref);

-- One OPEN report per (chat_type, thread_ref, reporter) — same dedupe shape
-- as chat_reports_one_open_per_reporter (migration 044). Can re-report after
-- resolution.
CREATE UNIQUE INDEX IF NOT EXISTS chat_conduct_reports_one_open_per_reporter
  ON chat_conduct_reports (chat_type, thread_ref, reporter_id)
  WHERE status = 'open';

ALTER TABLE chat_conduct_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_conduct_reports_super_admin_read ON chat_conduct_reports;
CREATE POLICY chat_conduct_reports_super_admin_read ON chat_conduct_reports
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE policy for `authenticated` — every write goes
-- through the service-role client from app/api/conduct/report (insert, after
-- validating the reporter is a real participant) and
-- app/api/admin/chat-conduct-reports/[id] (mark-reviewed, after an
-- isSuperAdmin check), matching moderation_flags' existing pattern.

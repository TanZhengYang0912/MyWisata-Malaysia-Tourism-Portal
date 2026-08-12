-- P4 — CLAUDE-ADMIN-CONDUCT.md: staff conduct monitoring (admin profanity/
-- slur toward users). Separate from moderation_flags (customer-safety flags,
-- migration 036) — different audience (super-admin-only, not admin/approver),
-- different shape (target_user_id, medium severity for profanity), and
-- moderation_flags' CHECK constraints (flag_type='slur' only) don't fit
-- profanity-level conduct flags. Additive only; moderation_flags untouched.

CREATE TABLE IF NOT EXISTS admin_conduct_flags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flagged_admin_id UUID NOT NULL REFERENCES users(id),
  target_user_id   UUID REFERENCES users(id),          -- null for admin_ai (no target)
  source           VARCHAR(20) NOT NULL CHECK (source IN ('ticket_reply', 'admin_ai')),
  source_ref_id    TEXT NOT NULL,                       -- ticket UUID, or chatbot_sessions.session_key
  original_text    TEXT NOT NULL,                       -- PII-redacted, profanity UNCENSORED
  severity         VARCHAR(10) NOT NULL CHECK (severity IN ('medium', 'high')),
  status           VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_admin_conduct_flags_status ON admin_conduct_flags(status);
CREATE INDEX IF NOT EXISTS idx_admin_conduct_flags_admin ON admin_conduct_flags(flagged_admin_id);

ALTER TABLE admin_conduct_flags ENABLE ROW LEVEL SECURITY;

-- Super-admin-only read — conduct records about staff are sensitive, a
-- regular admin/approver must not see flags about other admins (unlike
-- moderation_flags, which is admin/approver-readable). No INSERT/UPDATE
-- policy — every write goes through the service-role client after a
-- server-side isSuperAdmin check, same pattern as moderation_flags.
DROP POLICY IF EXISTS admin_conduct_flags_super_admin_read ON admin_conduct_flags;
CREATE POLICY admin_conduct_flags_super_admin_read ON admin_conduct_flags
  FOR SELECT USING (is_super_admin(auth.uid()));

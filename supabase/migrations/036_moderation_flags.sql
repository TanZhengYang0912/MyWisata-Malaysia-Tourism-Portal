-- P4: CLAUDE-MODERATION.md — slur auto-flagging for admin review.
--
-- One small table covers all four moderated inputs (source_type +
-- source_id), rather than per-row had_profanity/had_slur booleans on
-- chatbot_messages/support_tickets/support_ticket_replies — the flag row
-- itself is what gets surfaced in the admin UI, so per-row columns on three
-- different tables would just be redundant surface with nothing extra shown
-- ("only add what you'll actually surface in the UI" — this doc's own
-- instruction). Routine profanity is masked in place and not tracked here;
-- only slurs (a safety issue, not just civility) get a row.
--
-- original_excerpt stores the PII-redacted-but-profanity-UNMASKED text (the
-- lib/moderation/clean.ts "original" field) so admin can see what was
-- actually said — never the raw display/storage text with real PII in it,
-- since that never exists anywhere in this design.

CREATE TABLE IF NOT EXISTS moderation_flags (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type       VARCHAR(20) NOT NULL CHECK (source_type IN ('chatbot_message', 'ticket', 'ticket_reply')),
  source_id         UUID NOT NULL,
  user_id           UUID REFERENCES users(id),
  flag_type         VARCHAR(20) NOT NULL DEFAULT 'slur' CHECK (flag_type IN ('slur')),
  severity          VARCHAR(10) NOT NULL DEFAULT 'high' CHECK (severity IN ('low', 'medium', 'high')),
  original_excerpt  TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_moderation_flags_status ON moderation_flags(status);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_source ON moderation_flags(source_type, source_id);

ALTER TABLE moderation_flags ENABLE ROW LEVEL SECURITY;

-- Admin-only read. No INSERT/UPDATE policy — every write goes through the
-- service-role client after a server-side permission/role check, same
-- pattern as affiliate_fraud_flags (migration 014) and every other table
-- this module has added.
DROP POLICY IF EXISTS moderation_flags_admin_read ON moderation_flags;
CREATE POLICY moderation_flags_admin_read ON moderation_flags
  FOR SELECT USING (is_admin(auth.uid()));

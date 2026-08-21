-- P4: CLAUDE-CAMPAIGN-CLEARING-TRANSLATE.md Feature 1 — campaign/UTM tagging.
--
-- Mirrors migration 035's `source` column: additive, nullable, populated going
-- forward only. Historical clicks stay NULL and are grouped under "Untagged"
-- by the dashboard rather than fabricating a label.
--
-- Sanitized before insert (lib/affiliate/campaign.ts: trim, lowercase,
-- [a-z0-9-_] only, capped) — VARCHAR(50) here is a defense-in-depth ceiling,
-- not the primary length enforcement.

ALTER TABLE affiliate_clicks
  ADD COLUMN IF NOT EXISTS campaign VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_campaign
  ON affiliate_clicks (campaign)
  WHERE campaign IS NOT NULL;

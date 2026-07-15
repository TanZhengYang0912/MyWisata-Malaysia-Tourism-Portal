-- P4: CLAUDE-FUNNEL-AI.md — share -> click -> conversion funnel, source tagging
--
-- affiliate_clicks has no way to link a click back to which share (or share
-- method) produced it. This adds a nullable `source` column, populated going
-- forward from the share URL's `?src=` param (see lib/affiliate/redirect.ts).
-- Historical clicks stay NULL — the funnel UI shows per-platform clicks/
-- conversions as "not available" for those rather than fabricating a number.
--
-- Values written here match share_events.platform's real vocabulary
-- ('native' | 'copy_link') — not a per-social-network breakdown. The Web
-- Share API never reports which app the OS share sheet routed to, so
-- per-social-network attribution isn't something we can ever honestly know;
-- per-method (share-sheet vs copied-link) is.

ALTER TABLE affiliate_clicks
  ADD COLUMN IF NOT EXISTS source VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_source
  ON affiliate_clicks (source)
  WHERE source IS NOT NULL;

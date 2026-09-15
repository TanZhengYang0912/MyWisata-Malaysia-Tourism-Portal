-- Adds a coarse device classification to share_events, so "Log every share
-- event" captures device/source alongside the fields already logged
-- (content type/id, user, platform, affiliate, timestamp).

ALTER TABLE public.share_events
  ADD COLUMN IF NOT EXISTS device TEXT;

COMMENT ON COLUMN public.share_events.device IS
  'Coarse device classification derived server-side from the User-Agent header at share time: mobile | tablet | desktop | unknown.';

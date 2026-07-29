-- P4: seed platform_settings['affiliate.cookie_days'].
--
-- lib/affiliate/settings.ts::getAttributionCookieDays() already reads this
-- key at both call sites (lib/affiliate/redirect.ts, the cookie-set path,
-- and lib/affiliate/attribution.ts, the expiry-guard path — same shared
-- function, not duplicated), falling back to a hardcoded 30 if the row is
-- missing. Live-verified this session: the row genuinely doesn't exist, so
-- the attribution window has been running on that code fallback the whole
-- time, not an admin-configurable setting. Seeding the row with the same
-- value (30) as the fallback changes nothing about current behavior — it
-- just makes the window one INSERT away from being changeable without a
-- deploy, matching every other affiliate/fraud/wallet threshold, which are
-- all real seeded rows already (see 037_affiliate_click_cap.sql for the same
-- pattern on a sibling setting).

INSERT INTO platform_settings (key, value)
SELECT 'affiliate.cookie_days', '30'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'affiliate.cookie_days');

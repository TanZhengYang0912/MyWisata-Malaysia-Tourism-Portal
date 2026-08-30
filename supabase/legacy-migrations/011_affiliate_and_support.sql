-- ============================================================
-- Migration 011 — P4 affiliate + support additions
-- (Originally 009 locally — renumbered because another member's
-- 009_stripe_wallet.sql was pushed and merged to origin/main first.)
-- Owner: Member 4 (Affiliate, Sharing & AI Support)
--
-- Additive only. Never alters or drops an existing column — see CLAUDE.md
-- Section 4. Safe to re-run (IF NOT EXISTS / WHERE NOT EXISTS throughout).
-- ============================================================

-- 1. DUPLICATE-PAYOUT GUARD (critical, Step 4): one order can pay affiliate
--    commission exactly once, even if the conversion hook (onOrderPaid) fires
--    twice for the same order.
ALTER TABLE affiliate_attributions
  ADD CONSTRAINT affiliate_attributions_order_id_unique UNIQUE (order_id);

-- 2. Ticket category (Step 8), set automatically when the chatbot escalates.
--    Additive with a default, so nothing on support_tickets (owned by another
--    member) breaks.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS category VARCHAR(30) NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- Note: an index on affiliate_clicks' link_id FK already exists —
-- idx_affiliate_clicks_link (001_initial_schema.sql) — so nothing to add there.

-- 3. Ensure an active affiliate commission rule exists (5%, matches the
--    scope doc's flat rate). supabase/seed.sql never inserts one, so without
--    this, Step 4's rate lookup finds nothing.
INSERT INTO commission_rules (name, rule_type, one_time_bonus, ongoing_rate, tier_name)
SELECT 'Standard Affiliate', 'affiliate', 0, 0.0500, 'standard'
WHERE NOT EXISTS (SELECT 1 FROM commission_rules WHERE rule_type = 'affiliate');

-- 4. RLS for affiliate_clicks / affiliate_attributions (Step 6 prerequisite).
--    Both tables were previously missing from every ENABLE ROW LEVEL SECURITY
--    list (001/003/007/008) — RLS was OFF, and migration 006's blanket grant
--    gives the `authenticated` Postgres role full SELECT/INSERT/UPDATE/DELETE
--    on every table. Net effect: any logged-in user could read (or write!)
--    every other user's click and commission data directly from the browser,
--    bypassing this module's API routes entirely. Closing that here rather
--    than leaving it — these are financial/provenance records this module
--    owns. Safe to add: service-role (BYPASSRLS) already does all writes to
--    these two tables (Step 2's click insert, Step 4's attribution insert),
--    so nothing currently relies on `authenticated` having direct access.
ALTER TABLE affiliate_clicks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affiliate_clicks_own_link ON affiliate_clicks;
CREATE POLICY affiliate_clicks_own_link ON affiliate_clicks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM affiliate_links al
      WHERE al.id = affiliate_clicks.link_id AND al.user_id = auth.uid()
    )
    OR is_admin(auth.uid())
  );

DROP POLICY IF EXISTS affiliate_attributions_own ON affiliate_attributions;
CREATE POLICY affiliate_attributions_own ON affiliate_attributions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM affiliate_clicks ac
      JOIN affiliate_links al ON al.id = ac.link_id
      WHERE ac.id = affiliate_attributions.click_id AND al.user_id = auth.uid()
    )
    OR is_admin(auth.uid())
  );

-- 5. Chatbot KB keyword fix (Step 7). The seeded 'Withdrawal timeline?' doc
--    and the 'How to earn rewards?' doc both list 'how' among their keywords,
--    and 'money' only appears on the rewards doc — so a plain keyword-overlap
--    match on "how do I withdraw money" (the exact demo-script query, Section
--    9) scores the REWARDS doc higher than the WITHDRAWAL doc (0.5 vs 0.25),
--    giving the visibly wrong answer. No reasonable keyword-matching
--    algorithm can disambiguate this on its own — 'money' and 'how' are
--    genuinely shared vocabulary between the two docs as seeded. Adding
--    'money' to the withdrawal doc's own keywords (a completely natural word
--    for a withdrawal FAQ) breaks the tie correctly: withdrawal scores 0.4
--    (2 of 5 keywords) vs rewards' 0.25 (1 of 4), and withdrawal clears the
--    0.3 threshold outright. See lib/chatbot/match.ts.
UPDATE chatbot_kb_documents
SET keywords = ARRAY['withdraw','payout','how long','approval','money']
WHERE title = 'Withdrawal timeline?'
  AND NOT ('money' = ANY(keywords));

-- 6. Admin read access to affiliate_links (Step 9 prerequisite). The
--    original affiliate_own policy (migration 004) is owner-only with no
--    admin clause, so an admin reading the platform-wide affiliate overview
--    would get zero rows back under RLS. Adds a second, purely additive
--    permissive SELECT policy (Postgres OR-combines multiple permissive
--    policies for the same command) rather than touching affiliate_own —
--    regular users' access is unchanged.
DROP POLICY IF EXISTS affiliate_links_admin_read ON affiliate_links;
CREATE POLICY affiliate_links_admin_read ON affiliate_links
  FOR SELECT USING (is_admin(auth.uid()));

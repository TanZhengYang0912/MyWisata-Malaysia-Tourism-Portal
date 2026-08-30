-- ============================================================
-- Migration 014 — P4 Phase 2 depth features (D: clearing, B: tiers, ...)
-- Owner: Member 4 (Affiliate, Sharing & AI Support)
--
-- One file for the whole phase, matching CLAUDE-PHASE2.md's original
-- single-migration design — extended as each feature (D, B, C, A) gets
-- built, same pattern as Phase 1's 011_affiliate_and_support.sql.
--
-- CLAUDE-PHASE2.md originally called this "010_p4_depth.sql" and referenced
-- "migration 009's flat 5% rule" — both are stale. 009 is the wallet owner's
-- 009_stripe_wallet.sql. This module's own Phase 1 migrations are
-- 011_affiliate_and_support.sql / 012_seed_gap_fill.sql (renumbered from
-- 009/010 after that first collision).
--
-- Numbered 014, not 013: this file was first written as 013, but before it
-- got committed, the wallet owner pushed a SECOND round — 010_seed_demo_wallets.sql,
-- 011_stripe_connect_withdrawal.sql, 012_connect_payouts_enabled.sql,
-- 013_phase5_withdraw.sql (Stripe Connect payouts) — landing on 013 too.
-- Renumbered past it rather than colliding again.
--
-- Note there are now two "011_" and two "012_" files in this folder (this
-- module's already-pushed Phase 1 ones, and the wallet owner's later ones)
-- — deliberately NOT renamed a second time. Renumbering already-pushed,
-- already-applied migrations that other people may have already run against
-- the shared project is worse than a confusing but harmless duplicate
-- prefix; Supabase/PostgREST track migrations by full filename, not the
-- numeric prefix, so this doesn't break anything mechanically. Check
-- `supabase/migrations/` for the actual highest number in use before adding
-- a new one — don't assume it's whatever this comment says next time either.
--
-- Additive only.
-- ============================================================

-- ── Feature D: commission clearing ───────────────────────────
ALTER TABLE affiliate_attributions
  ADD COLUMN IF NOT EXISTS cleared_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

-- ⚠️ DEVIATION FROM THE ORIGINAL SPEC — read before touching clearing.ts.
--
-- CLAUDE-PHASE2.md's Section 1 also specified a unique index on
-- wallet_ledger (entry_type='reward_cleared') as the clearing job's
-- idempotency guard, and its Section 5 describes moving money from
-- wallets.pending_balance to wallets.available_balance at clearing time.
--
-- That's the PRE-009 wallet model. Since Phase 1, affiliate commissions are
-- credited via the wallet owner's credit_earnings() RPC directly into
-- wallets.earnings_sen (009_stripe_wallet.sql) — spendable AND withdrawable
-- immediately, per that RPC's own doc comment. wallets.pending_balance /
-- available_balance and wallet_ledger are dead columns as far as the real
-- wallet UI is concerned (it reads topup_sen + earnings_sen only).
--
-- Implementing Feature D literally (moving money between the old columns)
-- would move money nobody's wallet page ever displays — building a feature
-- that LOOKS like it works but is invisible in the actual wallet. So this
-- was adapted instead: lib/affiliate/attribution.ts no longer calls
-- creditAffiliateCommission() immediately on a paid order. It only inserts
-- the 'pending' attribution row. lib/affiliate/clearing.ts is now the ONLY
-- caller of creditAffiliateCommission() — the wallet credit itself doesn't
-- happen until the commission actually clears. This makes "Pending" mean
-- what it's supposed to mean: not yet in the affiliate's spendable wallet.
-- It also matches CLAUDE-PHASE2.md's own Section 8 demo script exactly
-- ("Admin -> Run clearing -> Alice's Pending moves to Available"), which
-- only makes literal sense if the money wasn't already there.
--
-- Idempotency for this design lives on affiliate_attributions itself, not
-- wallet_ledger: `UPDATE affiliate_attributions SET status='confirmed' ...
-- WHERE status='pending'` is the atomic claim — see clearing.ts. No unique
-- index needed on wallet_ledger since nothing writes to it.
--
-- (credit_earnings() itself has no idempotency guard of its own — p_ref_id
-- is accepted as a parameter but never persisted or checked against anything
-- in the RPC body. The atomic claim above is what prevents a double credit,
-- not the RPC.)

-- ── Feature B: tiered commission ─────────────────────────────
--
-- ⚠️ DEVIATION FROM THE ORIGINAL SPEC: it says to add a new `min_referrals`
-- column to commission_rules. That column already exists —
-- `min_conversions INTEGER DEFAULT 0` (001_initial_schema.sql) is the exact
-- same concept, just named for the "recommendation" rule_type this table
-- also serves. Reused it rather than adding a second column meaning the
-- same thing. `is_active` also already exists as specified, so this section
-- needs no ALTER TABLE at all — only data changes.
--
-- Deactivate (not delete) migration 011's flat 5% 'standard' rule, so
-- historical attributions that reference it by rate — not by row id — still
-- make sense; nothing FKs to commission_rules from affiliate_attributions.
UPDATE commission_rules
SET is_active = FALSE
WHERE rule_type = 'affiliate' AND tier_name = 'standard';

INSERT INTO commission_rules (name, rule_type, one_time_bonus, ongoing_rate, tier_name, min_conversions)
SELECT * FROM (VALUES
  ('Affiliate — Bronze', 'affiliate', 0, 0.0300, 'bronze',  0),
  ('Affiliate — Silver', 'affiliate', 0, 0.0500, 'silver',  5),
  ('Affiliate — Gold',   'affiliate', 0, 0.0700, 'gold',   20)
) AS t(name, rule_type, one_time_bonus, ongoing_rate, tier_name, min_conversions)
WHERE NOT EXISTS (
  SELECT 1 FROM commission_rules WHERE rule_type = 'affiliate' AND tier_name = t.tier_name
);

-- ── Feature C: fraud detection ───────────────────────────────
--
-- Matches CLAUDE-PHASE2.md's Section 1 table definition as-is — the schema
-- it assumes (users, affiliate_links, is_admin(uid)) checked out exactly
-- against 001_initial_schema.sql / 003_rls_policies.sql, no adaptation
-- needed here (unlike Features D and B above). order_id is deliberately a
-- bare UUID with no FK, per spec — a flag can reference an order that a
-- conversion-time guard rejected before any durable relationship to it made
-- sense to enforce.
CREATE TABLE IF NOT EXISTS affiliate_fraud_flags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id      UUID REFERENCES affiliate_links(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id),          -- the affiliate under suspicion
  order_id     UUID,                                -- if the flag arose at conversion time
  flag_type    VARCHAR(30) NOT NULL
                 CHECK (flag_type IN (
                   'self_referral','duplicate_attribution','expired_attribution',
                   'click_velocity','zero_conversion','visitor_clustering'
                 )),
  severity     VARCHAR(10) NOT NULL DEFAULT 'medium'
                 CHECK (severity IN ('low','medium','high')),
  detail       JSONB,                               -- evidence: counts, windows, ids
  status       VARCHAR(20) NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','reviewed','dismissed')),
  reviewed_by  UUID REFERENCES users(id),
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_status ON affiliate_fraud_flags(status);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_user   ON affiliate_fraud_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_link   ON affiliate_fraud_flags(link_id);

ALTER TABLE affiliate_fraud_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fraud_flags_admin_only ON affiliate_fraud_flags;
CREATE POLICY fraud_flags_admin_only ON affiliate_fraud_flags
  FOR SELECT USING (is_admin(auth.uid()));

-- All writes (guard-trip logging, the sweep, admin dismiss/confirm) go
-- through the service-role client after an explicit permission check in the
-- route — same pattern as every other admin-only table in this module. No
-- INSERT/UPDATE policy needed for anon/authenticated roles.

-- Detection thresholds, not hardcoded — see lib/affiliate/fraud.ts. Guarded
-- inserts so re-running this file (or a project that already has some of
-- these keys) doesn't clobber an admin's tuning.
INSERT INTO platform_settings (key, value, description)
SELECT 'fraud.click_velocity_max', '20', 'Max clicks on one affiliate link within the velocity window before flagging'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'fraud.click_velocity_max');

INSERT INTO platform_settings (key, value, description)
SELECT 'fraud.click_velocity_window_minutes', '60', 'Rolling window (minutes) the click-velocity check counts clicks over'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'fraud.click_velocity_window_minutes');

INSERT INTO platform_settings (key, value, description)
SELECT 'fraud.visitor_clustering_min_clicks', '10', 'Minimum total clicks on a link before visitor-clustering is even evaluated'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'fraud.visitor_clustering_min_clicks');

INSERT INTO platform_settings (key, value, description)
SELECT 'fraud.visitor_clustering_ratio', '0.5', 'Share (0-1) of a link''s clicks from one visitor hash that triggers a flag'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'fraud.visitor_clustering_ratio');

INSERT INTO platform_settings (key, value, description)
SELECT 'fraud.zero_conversion_min_clicks', '50', 'Minimum clicks on a link with zero referrals before flagging as likely bot traffic'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'fraud.zero_conversion_min_clicks');

-- ⚠️ DEVIATION: added after initial Feature C testing — see lib/affiliate/fraud.ts's
-- file header for the full reasoning. Auto-disabling a link on the FIRST
-- self-referral flag (a literal reading of "high severity -> disable")
-- punishes a single innocent self-click (e.g. clicking your own shared link
-- out of habit) as harshly as real abuse. These two settings gate a real
-- pattern requirement instead: only disable once the same link racks up
-- self_referral flags repeatedly. Sweep-detected flags (click_velocity,
-- visitor_clustering, zero_conversion) never auto-disable at all, regardless
-- of severity — always admin review only.
INSERT INTO platform_settings (key, value, description)
SELECT 'fraud.self_referral_auto_disable_count', '3', 'Self-referral flags on the same link (within the window below) before it is auto-disabled'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'fraud.self_referral_auto_disable_count');

INSERT INTO platform_settings (key, value, description)
SELECT 'fraud.self_referral_auto_disable_window_days', '30', 'Rolling window (days) the self-referral auto-disable count is evaluated over'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'fraud.self_referral_auto_disable_window_days');

-- ── Feature A: LLM + RAG chatbot ─────────────────────────────
--
-- ⚠️ DEVIATIONS FROM THE ORIGINAL SPEC — two, both found by reading the real
-- schema before writing this (RULE ZERO), same as every other feature:
--
-- 1. `vector(1536)` — that dimension is OpenAI's (text-embedding-3-small /
--    ada-002). We're building against Gemini (text-embedding-004), which is
--    768-dimensional. Used vector(768) throughout — the migration, the
--    match_kb_documents RPC below, and lib/chatbot/embed.ts's return type
--    all agree on 768. If this project ever switches embedding providers,
--    every one of those has to change together.
--
-- 2. `chatbot_message_kb_refs` — CLAUDE-PHASE2.md's Section 1 has this as a
--    new CREATE TABLE with columns `kb_id`/`similarity` and a UNIQUE
--    (message_id, kb_id) constraint. The table already exists —
--    001_initial_schema.sql line ~182, tagged "[P1-later] RAG citation
--    links (not used in demo)" — with columns `document_id`/`score` and NO
--    unique constraint. It was clearly always meant for exactly this
--    feature, just never wired up. Used the real columns; no CREATE TABLE
--    needed. No uniqueness guard either — a message citing the same doc
--    twice isn't a correctness problem here (each row is just "this doc was
--    part of this answer's context"), so nothing enforces it.
--
-- ⚠️ Also found while reading that table: chatbot_message_kb_refs was never
-- added to any ENABLE ROW LEVEL SECURITY list (001/003/007/008) — same class
-- of gap as affiliate_clicks/affiliate_attributions in migration 011 (see
-- CLAUDE.md Section 2). With RLS off, migration 006's blanket grant means
-- ANY logged-in user can read or write every citation row directly from the
-- browser. This table is exclusively used by this module (nothing else
-- references it), so fixed it the same way affiliate_fraud_flags was fixed
-- in this same migration's Feature C section: RLS on, admin-only SELECT.
-- All app-side INSERTs already go through the service-role client
-- (app/api/chatbot/ask/route.ts), which bypasses RLS regardless.
ALTER TABLE chatbot_message_kb_refs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chatbot_message_kb_refs_admin_only ON chatbot_message_kb_refs;
CREATE POLICY chatbot_message_kb_refs_admin_only ON chatbot_message_kb_refs
  FOR SELECT USING (is_admin(auth.uid()));

-- ⚠️ REAL BUG FOUND live-testing the admin ticket transcript view (Feature
-- A's provenance overlay was the first thing to actually exercise this path
-- against a logged-in customer's session instead of a guest one):
--
-- chatbot_sessions_own (migration 007) is `user_id = auth.uid() OR user_id
-- IS NULL` — no admin bypass. chatbot_messages_own DOES OR in
-- is_admin(auth.uid()), but that doesn't help: its EXISTS subquery reads
-- FROM chatbot_sessions, and RLS on chatbot_sessions is enforced even
-- inside that subquery. For any session with a real (non-null,
-- non-admin) owner, the session row is invisible to the subquery under
-- chatbot_sessions' OWN policy before chatbot_messages_own's is_admin()
-- clause is ever reached — so EXISTS() evaluates false for the admin
-- regardless of that clause. Net effect: GET /api/admin/tickets/[id]/transcript
-- has silently returned an empty transcript for every ticket tied to a
-- logged-in customer's session since Phase 1 shipped — it only ever
-- appeared to work for guest (user_id IS NULL) sessions. Not a Phase 2
-- regression, just newly surfaced. Fixed at the source (chatbot_sessions),
-- entirely within this module's own tables.
DROP POLICY IF EXISTS chatbot_sessions_own ON chatbot_sessions;
CREATE POLICY chatbot_sessions_own ON chatbot_sessions
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL OR is_admin(auth.uid()));

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE chatbot_kb_documents
  ADD COLUMN IF NOT EXISTS embedding    vector(768),
  ADD COLUMN IF NOT EXISTS embedded_at  TIMESTAMPTZ,
  -- Doesn't exist on this table at all (001_initial_schema.sql has no
  -- updated_at for chatbot_kb_documents). Needed so the reindex route can
  -- tell "edited since last embedded" apart from "never embedded" — the KB
  -- editor (Section 2 of CLAUDE-PHASE2.md) sets this on every save.
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Cosine similarity search. STABLE + plain (not SECURITY DEFINER) — every
-- caller in this module already goes through the service-role client, which
-- bypasses RLS regardless, so there's no privilege boundary this function
-- needs to enforce itself.
CREATE OR REPLACE FUNCTION match_kb_documents(query_embedding vector(768), match_count INT DEFAULT 3)
RETURNS TABLE (id UUID, title VARCHAR, body TEXT, category VARCHAR, similarity NUMERIC)
LANGUAGE sql STABLE
AS $$
  SELECT id, title, body, category, 1 - (embedding <=> query_embedding) AS similarity
  FROM chatbot_kb_documents
  WHERE is_active = TRUE AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_kb_documents(vector(768), INT) TO authenticated, anon, service_role;

-- Retrieval threshold — never hardcoded, per CLAUDE-PHASE2.md Section 7.
INSERT INTO platform_settings (key, value, description)
SELECT 'chatbot.similarity_threshold', '0.75', 'Minimum cosine similarity for the top retrieved KB doc before the LLM is called at all'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'chatbot.similarity_threshold');

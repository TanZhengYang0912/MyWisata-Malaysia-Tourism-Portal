-- Migration 039 — close the affiliate_links RLS gap Codex found.
--
-- affiliate_insert_own (migration 004, chunjie, "feat(vendor-portal): wire
-- and adapt vendor module to restructured main branch directory system" —
-- a broad RLS-audit sweep, not affiliate-specific) only checked
-- auth.uid() = user_id. Any logged-in user could insert their own
-- affiliate_links row directly against Supabase, bypassing
-- app/api/affiliate/link/route.ts's tier gate entirely.
--
-- This mirrors that route's exact condition — kyc_status <> 'rejected' AND
-- tier at or above 'profile_complete' (lib/constants.ts's TIER_ORDER /
-- REQUIRED_TIER.AFFILIATE_BASIC). If that TS ladder ever changes, this SQL
-- must be updated by hand to match — there's no shared source of truth
-- across the TS/SQL boundary, so this is the closest honest approximation,
-- not a guarantee that can't drift silently. scripts/verify-affiliate-links-rls.mjs
-- (live-DB, real Supabase Auth sessions — same class of test as
-- scripts/replay-kyc-security-db.mjs, not the network-free vitest suite)
-- asserts against this exact condition so a future policy or TIER_ORDER
-- drift fails loudly instead of silently.
--
-- Confirmed safe for gen_affiliate_code() (KYC-approval auto-creation,
-- migration 20260716000096): that function is SECURITY DEFINER, so its own
-- INSERT never evaluates this policy — this change has zero effect on it.

DROP POLICY IF EXISTS affiliate_insert_own ON affiliate_links;
CREATE POLICY affiliate_insert_own ON affiliate_links
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.kyc_status <> 'rejected'
        AND u.tier IN ('profile_complete', 'kyc_verified')
    )
  );

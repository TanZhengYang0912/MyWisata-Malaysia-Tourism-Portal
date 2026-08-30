-- ============================================================
-- P-TMF (Trust & Money Flow) — Row Level Security Policies
-- Critical security layer. Without RLS the anon key can read ANY row.
--
-- Design:
--   - Every user-owned table: user reads own rows; admin reads all
--   - Governance tables (approvals, audit): admin only
--   - RPCs from 002_governance_functions.sql use SECURITY DEFINER,
--     so they bypass RLS by design — role checks are added below
--   - Public reference data (roles, categories): world-readable
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- Role check helper functions
-- STABLE = safe for RLS use (postgres caches within a statement)
-- SECURITY DEFINER = runs with postgres privileges to bypass its own RLS lookup
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = uid
      AND r.name IN ('super_admin', 'approver')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = uid AND r.name = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_approver(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = uid AND r.name IN ('super_admin', 'approver')
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin, is_super_admin, is_approver TO authenticated, anon;


-- ─────────────────────────────────────────────────────────────
-- Enable RLS on all P-TMF-owned tables
-- ─────────────────────────────────────────────────────────────

ALTER TABLE users                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_submissions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger               ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_approvals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_destinations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_recommendations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_conversions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_commissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rules            ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_links             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings           ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- USERS
-- Read: own profile OR admin
-- Update: own profile only (NOT kyc_status — that's a governance field)
-- Insert: handled by trigger (SECURITY DEFINER bypasses RLS)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY users_select_own_or_admin ON users
  FOR SELECT USING (auth.uid() = id OR is_admin(auth.uid()));

CREATE POLICY users_update_own ON users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ─────────────────────────────────────────────────────────────
-- ROLES + USER_ROLES — reference data
-- Roles: world-readable (needed for auth hook)
-- User_roles: users see own; admins see all; only super_admin can grant
-- ─────────────────────────────────────────────────────────────

CREATE POLICY roles_read_all ON roles FOR SELECT USING (true);

CREATE POLICY user_roles_read_own_or_admin ON user_roles
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY user_roles_super_admin_manages ON user_roles
  FOR ALL USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────
-- USER_PREFERENCES — own only
-- ─────────────────────────────────────────────────────────────

CREATE POLICY user_prefs_own ON user_preferences
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- EMAIL / PHONE VERIFICATIONS — own only (writes via SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY email_verif_own ON email_verifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY phone_verif_own ON phone_verifications
  FOR SELECT USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- KYC_SUBMISSIONS
-- Read: own OR admin
-- Insert: own (customer submits)
-- Update: admin only (approve/reject via review_kyc RPC)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY kyc_read_own_or_admin ON kyc_submissions
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY kyc_insert_own ON kyc_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- WALLETS
-- Read: own OR admin
-- Update: NONE from client — only via RPCs (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY wallets_read_own_or_admin ON wallets
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────
-- WALLET_LEDGER
-- Read: own wallet's entries OR admin
-- Insert: NONE from client — only via RPCs / creditWallet helper
-- ─────────────────────────────────────────────────────────────

CREATE POLICY ledger_read_own_or_admin ON wallet_ledger
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM wallets w WHERE w.id = wallet_ledger.wallet_id AND w.user_id = auth.uid())
    OR is_admin(auth.uid())
  );


-- ─────────────────────────────────────────────────────────────
-- WITHDRAWAL_REQUESTS
-- Read: own OR approver+admin
-- Insert: NONE from client — via submit_withdrawal RPC (which validates KYC)
-- Update: NONE from client — via approve_withdrawal RPC
-- ─────────────────────────────────────────────────────────────

CREATE POLICY withdrawal_read_own_or_admin ON withdrawal_requests
  FOR SELECT USING (auth.uid() = user_id OR is_approver(auth.uid()));


-- ─────────────────────────────────────────────────────────────
-- WITHDRAWAL_APPROVALS — approver+admin only
-- ─────────────────────────────────────────────────────────────

CREATE POLICY withdrawal_approvals_admin ON withdrawal_approvals
  FOR SELECT USING (is_approver(auth.uid()));


-- ─────────────────────────────────────────────────────────────
-- PAYOUT_DESTINATIONS — own only
-- ─────────────────────────────────────────────────────────────

CREATE POLICY payout_dest_own ON payout_destinations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- VENDOR_RECOMMENDATIONS
-- Read: own submissions OR approved-status (public feed) OR admin
-- Insert: own (must be KYC'd — checked in RPC)
-- Update: admin only (via review RPC)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY vendor_rec_read ON vendor_recommendations
  FOR SELECT USING (
    auth.uid() = recommender_id
    OR status IN ('approved', 'converted')
    OR is_admin(auth.uid())
  );

CREATE POLICY vendor_rec_insert_own ON vendor_recommendations
  FOR INSERT WITH CHECK (auth.uid() = recommender_id);


-- ─────────────────────────────────────────────────────────────
-- RECOMMENDATION_CONVERSIONS + COMMISSIONS — read own, admin manages
-- ─────────────────────────────────────────────────────────────

CREATE POLICY rec_conv_read ON recommendation_conversions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM vendor_recommendations vr
             WHERE vr.id = recommendation_conversions.recommendation_id
               AND (vr.recommender_id = auth.uid() OR is_admin(auth.uid())))
  );

CREATE POLICY rec_commissions_read_own ON recommendation_commissions
  FOR SELECT USING (auth.uid() = recommender_id OR is_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────
-- COMMISSION_RULES — public read (transparent scoring)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY commission_rules_read ON commission_rules FOR SELECT USING (true);


-- ─────────────────────────────────────────────────────────────
-- AFFILIATE_LINKS — own only
-- ─────────────────────────────────────────────────────────────

CREATE POLICY affiliate_own ON affiliate_links
  FOR SELECT USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- AUDIT_LOGS — admin only for read; writes via auditAndNotify (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY audit_admin_read ON audit_logs
  FOR SELECT USING (is_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────
-- NOTIFICATIONS — own only; writes via SECURITY DEFINER
-- Users can mark own as read
-- ─────────────────────────────────────────────────────────────

CREATE POLICY notif_read_own ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY notif_update_own_read ON notifications
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- PLATFORM_SETTINGS — world-readable (config discovery); super_admin writes
-- ─────────────────────────────────────────────────────────────

CREATE POLICY settings_read ON platform_settings FOR SELECT USING (true);
CREATE POLICY settings_super_admin_write ON platform_settings
  FOR ALL USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));


-- ============================================================
-- Add caller role checks to governance RPCs (defence in depth)
-- The RPCs are SECURITY DEFINER — they bypass RLS but MUST verify
-- the caller has the right role themselves.
-- ============================================================

CREATE OR REPLACE FUNCTION approve_withdrawal(
  p_request_id  UUID,
  p_approver_id UUID,
  p_action      VARCHAR,
  p_note        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request        withdrawal_requests%ROWTYPE;
  v_approve_count  INT;
  v_final_status   VARCHAR;
BEGIN
  -- Defence in depth: verify caller matches p_approver_id AND is an approver
  IF p_approver_id != auth.uid() THEN
    RAISE EXCEPTION 'Approver ID mismatch — cannot act on behalf of another user';
  END IF;
  IF NOT is_approver(p_approver_id) THEN
    RAISE EXCEPTION 'Caller is not an approver';
  END IF;

  IF p_action NOT IN ('approve', 'reject', 'hold') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_request FROM withdrawal_requests
   WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found: %', p_request_id;
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Request already in terminal state: %', v_request.status;
  END IF;

  -- Approver cannot approve their own withdrawal (segregation of duties)
  IF v_request.user_id = p_approver_id THEN
    RAISE EXCEPTION 'Approver cannot act on their own withdrawal request';
  END IF;

  IF EXISTS (
    SELECT 1 FROM withdrawal_approvals
     WHERE request_id = p_request_id AND approver_id = p_approver_id
  ) THEN
    RAISE EXCEPTION 'Approver already acted on this request';
  END IF;

  INSERT INTO withdrawal_approvals (request_id, approver_id, action, note)
  VALUES (p_request_id, p_approver_id, p_action, p_note);

  IF p_action = 'reject' THEN
    v_final_status := 'rejected';
    INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
    VALUES (v_request.wallet_id, 'withdrawal_release', v_request.amount, 'available',
            p_request_id, 'Withdrawal rejected: ' || COALESCE(p_note, ''));
    UPDATE wallets
       SET available_balance = available_balance + v_request.amount, updated_at = NOW()
     WHERE id = v_request.wallet_id;

  ELSIF p_action = 'hold' THEN
    v_final_status := 'pending';

  ELSIF p_action = 'approve' THEN
    SELECT COUNT(*) INTO v_approve_count FROM withdrawal_approvals
     WHERE request_id = p_request_id AND action = 'approve';

    IF v_request.requires_dual_approval AND v_approve_count < 2 THEN
      v_final_status := 'pending';
    ELSE
      v_final_status := 'completed';
      INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
      VALUES (v_request.wallet_id, 'withdrawal_complete', -v_request.amount, 'available',
              p_request_id, 'Withdrawal completed');
    END IF;
  END IF;

  UPDATE withdrawal_requests SET status = v_final_status, updated_at = NOW()
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'status', v_final_status,
    'action', p_action,
    'approve_count', COALESCE(v_approve_count, 0)
  );
END;
$$;


CREATE OR REPLACE FUNCTION review_kyc(
  p_submission_id UUID,
  p_admin_id      UUID,
  p_action        VARCHAR,
  p_reason        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_submission     kyc_submissions%ROWTYPE;
  v_new_kyc_status VARCHAR;
BEGIN
  IF p_admin_id != auth.uid() THEN
    RAISE EXCEPTION 'Admin ID mismatch';
  END IF;
  IF NOT is_admin(p_admin_id) THEN
    RAISE EXCEPTION 'Caller is not an admin';
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_submission FROM kyc_submissions
   WHERE id = p_submission_id FOR UPDATE;
  IF v_submission.status != 'pending' THEN
    RAISE EXCEPTION 'Submission not pending (current: %)', v_submission.status;
  END IF;

  v_new_kyc_status := CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END;

  UPDATE kyc_submissions
     SET status = v_new_kyc_status,
         reviewer_id = p_admin_id,
         reviewed_at = NOW(),
         rejection_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE NULL END
   WHERE id = p_submission_id;

  UPDATE users
     SET kyc_status = v_new_kyc_status, updated_at = NOW()
   WHERE id = v_submission.user_id;

  RETURN jsonb_build_object(
    'submission_id', p_submission_id,
    'user_id',       v_submission.user_id,
    'new_status',    v_new_kyc_status
  );
END;
$$;


CREATE OR REPLACE FUNCTION convert_recommendation(
  p_recommendation_id UUID,
  p_admin_id          UUID,
  p_vendor_id         UUID,
  p_bonus_amount      NUMERIC DEFAULT 12.50
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec              vendor_recommendations%ROWTYPE;
  v_wallet_id        UUID;
  v_conversion_id    UUID;
  v_ledger_entry_id  UUID;
  v_commission_id    UUID;
BEGIN
  IF p_admin_id != auth.uid() THEN RAISE EXCEPTION 'Admin ID mismatch'; END IF;
  IF NOT is_admin(p_admin_id) THEN RAISE EXCEPTION 'Caller is not an admin'; END IF;
  IF p_bonus_amount <= 0 OR p_bonus_amount > 1000 THEN
    RAISE EXCEPTION 'Bonus amount out of range: %', p_bonus_amount;
  END IF;

  SELECT * INTO v_rec FROM vendor_recommendations
   WHERE id = p_recommendation_id FOR UPDATE;

  IF v_rec.status != 'approved' THEN
    RAISE EXCEPTION 'Recommendation must be approved before conversion (current: %)', v_rec.status;
  END IF;

  INSERT INTO recommendation_conversions (recommendation_id, converted_vendor_id)
  VALUES (p_recommendation_id, p_vendor_id) RETURNING id INTO v_conversion_id;

  UPDATE vendor_recommendations
     SET status = 'converted', converted_vendor_id = p_vendor_id,
         reviewed_at = NOW(), reviewer_id = p_admin_id
   WHERE id = p_recommendation_id;

  SELECT id INTO v_wallet_id FROM wallets WHERE user_id = v_rec.recommender_id;
  IF v_wallet_id IS NULL THEN RAISE EXCEPTION 'Recommender has no wallet'; END IF;

  INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
  VALUES (v_wallet_id, 'reward_pending', p_bonus_amount, 'pending',
          v_conversion_id, 'Recommendation conversion bonus')
  RETURNING id INTO v_ledger_entry_id;

  UPDATE wallets
     SET pending_balance = pending_balance + p_bonus_amount, updated_at = NOW()
   WHERE id = v_wallet_id;

  INSERT INTO recommendation_commissions
    (recommender_id, conversion_id, commission_type, amount, ledger_entry_id)
  VALUES (v_rec.recommender_id, v_conversion_id, 'bonus', p_bonus_amount, v_ledger_entry_id)
  RETURNING id INTO v_commission_id;

  RETURN jsonb_build_object(
    'conversion_id',   v_conversion_id,
    'ledger_entry_id', v_ledger_entry_id,
    'commission_id',   v_commission_id,
    'amount_credited', p_bonus_amount
  );
END;
$$;


-- Add idempotency table for API-level dedup
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key             VARCHAR(128) PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id),
  endpoint        VARCHAR(200) NOT NULL,
  request_hash    VARCHAR(64) NOT NULL,
  response_body   JSONB,
  status_code     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY idempotency_own ON idempotency_keys
  FOR SELECT USING (auth.uid() = user_id);

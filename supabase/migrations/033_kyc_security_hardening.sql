-- Server-side tier gates. API checks remain a usability layer only.

CREATE OR REPLACE FUNCTION debit_withdrawal(
  p_user_id UUID,
  p_amount_rm NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
  v_wallet_id UUID;
  v_earnings BIGINT;
  v_amount_sen BIGINT;
  v_min_amount_sen BIGINT;
  v_request_id UUID;
  v_dual BOOLEAN;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT tier, kyc_status, stripe_connect_account_id, stripe_payouts_enabled
    INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_user.tier <> 'kyc_verified' OR v_user.kyc_status <> 'approved' THEN
    RAISE EXCEPTION 'kyc_required';
  END IF;
  IF v_user.stripe_connect_account_id IS NULL OR NOT COALESCE(v_user.stripe_payouts_enabled, false) THEN
    RAISE EXCEPTION 'payout_account_required';
  END IF;

  v_amount_sen := round_sen(p_amount_rm);
  IF v_amount_sen <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;
  SELECT COALESCE(value::BIGINT, 1000) INTO v_min_amount_sen FROM platform_settings WHERE key = 'withdrawal.min_amount_sen';
  v_min_amount_sen := COALESCE(v_min_amount_sen, 1000);
  IF v_amount_sen < v_min_amount_sen THEN RAISE EXCEPTION 'below_min_withdrawal'; END IF;

  SELECT id, earnings_sen INTO v_wallet_id, v_earnings FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_earnings < v_amount_sen THEN RAISE EXCEPTION 'insufficient_earnings'; END IF;
  v_dual := v_amount_sen >= 50000;

  BEGIN
    INSERT INTO withdrawal_requests (user_id, wallet_id, amount, destination_label, status, requires_dual_approval)
    VALUES (p_user_id, v_wallet_id, p_amount_rm, 'Stripe bank on file', 'pending', v_dual)
    RETURNING id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'pending_withdrawal_exists';
  END;

  UPDATE wallets SET earnings_sen = earnings_sen - v_amount_sen, updated_at = now() WHERE id = v_wallet_id;
  INSERT INTO wallet_transactions (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES (p_user_id, v_wallet_id, 'withdrawal_reserve', v_amount_sen, 'earnings', 'debit', v_request_id, 'Withdrawal debited — pending admin approval');
  RETURN jsonb_build_object('request_id', v_request_id, 'requires_dual_approval', v_dual);
END;
$$;

CREATE OR REPLACE FUNCTION submit_recommendation(
  p_vendor_name TEXT,
  p_description TEXT,
  p_state TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_vendor_address TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count INT;
  v_rec_id UUID;
  v_norm_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user_id AND tier_rank(tier) >= tier_rank('profile_complete')) THEN
    RAISE EXCEPTION 'tier_insufficient: profile_complete required';
  END IF;
  v_norm_name := normalize_vendor_name(p_vendor_name);
  IF length(v_norm_name) = 0 THEN RAISE EXCEPTION 'vendor_name_blank'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('rec_submit:' || v_user_id::text));
  SELECT count(*) INTO v_count FROM vendor_recommendations WHERE recommender_id = v_user_id AND created_at > now() - interval '24 hours';
  IF v_count >= 5 THEN RAISE EXCEPTION 'rate_limited'; END IF;
  IF EXISTS (SELECT 1 FROM vendor_recommendations WHERE recommender_id = v_user_id AND vendor_name_normalized = v_norm_name AND status NOT IN ('rejected')) THEN
    RAISE EXCEPTION 'duplicate';
  END IF;
  INSERT INTO vendor_recommendations (recommender_id, vendor_name, vendor_name_normalized, description, state, category_id, vendor_address, status)
  VALUES (v_user_id, p_vendor_name, v_norm_name, p_description, p_state, p_category_id, p_vendor_address, 'pending')
  RETURNING id INTO v_rec_id;
  RETURN v_rec_id;
END;
$$;

GRANT EXECUTE ON FUNCTION debit_withdrawal(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_recommendation(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

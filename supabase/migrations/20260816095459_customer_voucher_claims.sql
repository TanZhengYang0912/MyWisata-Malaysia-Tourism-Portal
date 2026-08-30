-- Customer voucher claims. Claims are customer entitlements; voucher_redemptions
-- remains the authoritative successful-order record.

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS is_claimable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS claim_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS redemption_mode VARCHAR(20) NOT NULL DEFAULT 'online';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_redemption_mode_check'
  ) THEN
    ALTER TABLE public.vouchers
      ADD CONSTRAINT vouchers_redemption_mode_check
      CHECK (redemption_mode IN ('online', 'in_store', 'both'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.customer_voucher_claims (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id  UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status      VARCHAR(20) NOT NULL DEFAULT 'claimed'
              CHECK (status IN ('claimed', 'redeemed', 'expired', 'revoked')),
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (voucher_id, user_id)
);

CREATE INDEX IF NOT EXISTS customer_voucher_claims_user_status_idx
  ON public.customer_voucher_claims(user_id, status, claimed_at DESC);
CREATE INDEX IF NOT EXISTS customer_voucher_claims_voucher_status_idx
  ON public.customer_voucher_claims(voucher_id, status);

ALTER TABLE public.customer_voucher_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_voucher_claims_owner_select ON public.customer_voucher_claims;
CREATE POLICY customer_voucher_claims_owner_select
  ON public.customer_voucher_claims
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

ALTER TABLE public.voucher_holds
  ADD COLUMN IF NOT EXISTS claim_id UUID REFERENCES public.customer_voucher_claims(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.claim_voucher(p_voucher_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_voucher public.vouchers%ROWTYPE;
  v_claim public.customer_voucher_claims%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'voucher_claim_auth_required'; END IF;

  SELECT * INTO v_voucher
    FROM public.vouchers
   WHERE id = p_voucher_id
   FOR UPDATE;
  IF NOT FOUND OR NOT v_voucher.is_active OR v_voucher.review_status <> 'approved'
     OR NOT v_voucher.is_claimable OR v_voucher.redemption_mode NOT IN ('online', 'both') THEN
    RAISE EXCEPTION 'voucher_not_claimable';
  END IF;
  IF v_voucher.claim_from IS NOT NULL AND v_voucher.claim_from > NOW() THEN
    RAISE EXCEPTION 'voucher_claim_not_started';
  END IF;
  IF v_voucher.claim_until IS NOT NULL AND v_voucher.claim_until < NOW() THEN
    RAISE EXCEPTION 'voucher_claim_closed';
  END IF;
  IF v_voucher.valid_until IS NOT NULL AND v_voucher.valid_until < NOW() THEN
    RAISE EXCEPTION 'voucher_expired';
  END IF;
  IF v_voucher.max_uses IS NOT NULL
     AND v_voucher.uses_count + v_voucher.reserved_uses >= v_voucher.max_uses THEN
    RAISE EXCEPTION 'voucher_limit_reached';
  END IF;

  SELECT * INTO v_claim
    FROM public.customer_voucher_claims
   WHERE voucher_id = p_voucher_id AND user_id = v_user
   FOR UPDATE;
  IF FOUND THEN
    IF v_claim.status = 'claimed' THEN
      RETURN jsonb_build_object(
        'claimId', v_claim.id,
        'voucherId', v_claim.voucher_id,
        'status', v_claim.status,
        'claimedAt', v_claim.claimed_at,
        'expiresAt', v_claim.expires_at
      );
    END IF;
    RAISE EXCEPTION 'voucher_already_claimed';
  END IF;

  INSERT INTO public.customer_voucher_claims(voucher_id, user_id, expires_at)
  VALUES (p_voucher_id, v_user, v_voucher.valid_until)
  RETURNING * INTO v_claim;

  RETURN jsonb_build_object(
    'claimId', v_claim.id,
    'voucherId', v_claim.voucher_id,
    'status', v_claim.status,
    'claimedAt', v_claim.claimed_at,
    'expiresAt', v_claim.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_voucher(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_voucher(UUID) TO authenticated;

-- Keep the existing ten-argument checkout function untouched for legacy code
-- entry. Claimed vouchers use this overload, which binds the claim to the
-- resulting voucher hold in the same database transaction.
CREATE OR REPLACE FUNCTION public.prepare_checkout(
  p_cart_id UUID,
  p_selected_item_ids UUID[],
  p_idempotency_key TEXT,
  p_request_hash TEXT,
  p_payment_method TEXT,
  p_subtotal NUMERIC,
  p_discount NUMERIC,
  p_total NUMERIC,
  p_voucher_code TEXT,
  p_claim_id UUID,
  p_lines JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_claim public.customer_voucher_claims%ROWTYPE;
  v_voucher_id UUID;
  v_result JSONB;
  v_session_id UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'checkout_auth_required'; END IF;
  IF p_claim_id IS NULL THEN
    RETURN public.prepare_checkout(
      p_cart_id, p_selected_item_ids, p_idempotency_key, p_request_hash,
      p_payment_method, p_subtotal, p_discount, p_total, p_voucher_code, p_lines
    );
  END IF;
  IF p_voucher_code IS NULL OR length(trim(p_voucher_code)) = 0 THEN
    RAISE EXCEPTION 'voucher_claim_requires_code';
  END IF;

  SELECT * INTO v_claim
    FROM public.customer_voucher_claims
   WHERE id = p_claim_id AND user_id = v_user
   FOR UPDATE;
  IF NOT FOUND OR v_claim.status <> 'claimed' THEN
    RAISE EXCEPTION 'voucher_claim_unavailable';
  END IF;
  IF v_claim.expires_at IS NOT NULL AND v_claim.expires_at < NOW() THEN
    UPDATE public.customer_voucher_claims SET status = 'expired' WHERE id = v_claim.id;
    RAISE EXCEPTION 'voucher_claim_expired';
  END IF;

  SELECT id INTO v_voucher_id
    FROM public.vouchers
   WHERE id = v_claim.voucher_id
     AND upper(code) = upper(trim(p_voucher_code))
     AND is_active
     AND review_status = 'approved'
     AND redemption_mode IN ('online', 'both');
  IF v_voucher_id IS NULL THEN RAISE EXCEPTION 'voucher_claim_mismatch'; END IF;

  v_result := public.prepare_checkout(
    p_cart_id, p_selected_item_ids, p_idempotency_key, p_request_hash,
    p_payment_method, p_subtotal, p_discount, p_total, p_voucher_code, p_lines
  );
  v_session_id := (v_result ->> 'checkout_session_id')::UUID;

  UPDATE public.voucher_holds
     SET claim_id = p_claim_id
   WHERE checkout_session_id = v_session_id
     AND voucher_id = v_voucher_id
     AND user_id = v_user
     AND status = 'held';
  IF NOT FOUND THEN RAISE EXCEPTION 'voucher_claim_hold_missing'; END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_checkout(UUID, UUID[], TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_checkout(UUID, UUID[], TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_customer_voucher_claim_redeemed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'committed' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.claim_id IS NOT NULL THEN
    UPDATE public.customer_voucher_claims
       SET status = 'redeemed', redeemed_at = NOW()
     WHERE id = NEW.claim_id AND status = 'claimed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS voucher_hold_claim_redeemed ON public.voucher_holds;
CREATE TRIGGER voucher_hold_claim_redeemed
  AFTER UPDATE OF status ON public.voucher_holds
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_customer_voucher_claim_redeemed();

REVOKE ALL ON FUNCTION public.mark_customer_voucher_claim_redeemed() FROM PUBLIC;
;

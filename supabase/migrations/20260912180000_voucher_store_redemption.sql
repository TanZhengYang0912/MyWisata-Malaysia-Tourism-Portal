-- Store voucher redemption is a customer-claim entitlement, not an order discount.
CREATE TABLE IF NOT EXISTS public.voucher_store_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.customer_voucher_claims(id) ON DELETE RESTRICT,
  voucher_id UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  outlet_id UUID NOT NULL REFERENCES public.outlets(id) ON DELETE RESTRICT,
  redeemed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  token_fingerprint TEXT NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (claim_id)
);

CREATE INDEX IF NOT EXISTS voucher_store_redemptions_outlet_idx
  ON public.voucher_store_redemptions(outlet_id, redeemed_at DESC);

ALTER TABLE public.voucher_store_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.voucher_store_redemptions FROM anon, authenticated;
GRANT ALL ON TABLE public.voucher_store_redemptions TO service_role;

CREATE OR REPLACE FUNCTION public.redeem_store_voucher(
  p_claim_id UUID,
  p_voucher_id UUID,
  p_vendor_id UUID,
  p_outlet_id UUID,
  p_redeemed_by UUID,
  p_token_fingerprint TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_claim public.customer_voucher_claims%ROWTYPE;
  v_voucher public.vouchers%ROWTYPE;
  v_redemption public.voucher_store_redemptions%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.outlets
     WHERE id = p_outlet_id AND vendor_id = p_vendor_id
  ) THEN
    RAISE EXCEPTION 'store_redemption_outlet_forbidden';
  END IF;

  SELECT * INTO v_voucher
    FROM public.vouchers
   WHERE id = p_voucher_id AND vendor_id = p_vendor_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'store_redemption_voucher_not_found'; END IF;
  IF NOT v_voucher.is_active OR v_voucher.review_status <> 'approved' THEN
    RAISE EXCEPTION 'store_redemption_voucher_inactive';
  END IF;
  IF v_voucher.redemption_mode NOT IN ('in_store', 'both') THEN
    RAISE EXCEPTION 'store_redemption_mode_not_supported';
  END IF;
  IF v_voucher.valid_from IS NOT NULL AND v_voucher.valid_from > NOW() THEN
    RAISE EXCEPTION 'store_redemption_not_started';
  END IF;
  IF v_voucher.valid_until IS NOT NULL AND v_voucher.valid_until < NOW() THEN
    RAISE EXCEPTION 'store_redemption_expired';
  END IF;
  IF v_voucher.outlet_id IS NOT NULL AND v_voucher.outlet_id <> p_outlet_id THEN
    RAISE EXCEPTION 'store_redemption_wrong_outlet';
  END IF;
  IF v_voucher.max_uses IS NOT NULL AND v_voucher.uses_count + v_voucher.reserved_uses >= v_voucher.max_uses THEN
    RAISE EXCEPTION 'store_redemption_limit_reached';
  END IF;

  SELECT * INTO v_claim
    FROM public.customer_voucher_claims
   WHERE id = p_claim_id AND voucher_id = p_voucher_id
   FOR UPDATE;
  IF NOT FOUND OR v_claim.status <> 'claimed' THEN
    RAISE EXCEPTION 'store_redemption_claim_unavailable';
  END IF;
  IF v_claim.expires_at IS NOT NULL AND v_claim.expires_at < NOW() THEN
    UPDATE public.customer_voucher_claims SET status = 'expired' WHERE id = v_claim.id;
    RAISE EXCEPTION 'store_redemption_claim_expired';
  END IF;

  INSERT INTO public.voucher_store_redemptions (
    claim_id, voucher_id, user_id, vendor_id, outlet_id, redeemed_by, token_fingerprint
  ) VALUES (
    v_claim.id, v_voucher.id, v_claim.user_id, p_vendor_id, p_outlet_id, p_redeemed_by, p_token_fingerprint
  ) RETURNING * INTO v_redemption;

  UPDATE public.vouchers
     SET uses_count = uses_count + 1
   WHERE id = v_voucher.id;
  UPDATE public.customer_voucher_claims
     SET status = 'redeemed', redeemed_at = v_redemption.redeemed_at
   WHERE id = v_claim.id;

  RETURN jsonb_build_object(
    'id', v_redemption.id,
    'claim_id', v_redemption.claim_id,
    'voucher_id', v_redemption.voucher_id,
    'outlet_id', v_redemption.outlet_id,
    'redeemed_at', v_redemption.redeemed_at
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'store_redemption_claim_already_redeemed';
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_store_voucher(UUID, UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_store_voucher(UUID, UUID, UUID, UUID, UUID, TEXT) TO service_role;

-- The original claim function only admitted online vouchers. Store vouchers
-- need the same customer claim lifecycle so their signed barcode can be shown.
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
     OR NOT v_voucher.is_claimable OR v_voucher.redemption_mode NOT IN ('online', 'in_store', 'both') THEN
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

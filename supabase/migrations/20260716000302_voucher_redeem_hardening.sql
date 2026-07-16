-- Keep the legacy redeem_voucher RPC compatible while enforcing the new
-- per-customer limit for any remaining callers.
CREATE OR REPLACE FUNCTION public.redeem_voucher(
  p_voucher_id UUID,
  p_order_id UUID,
  p_user_id UUID,
  p_discount NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_voucher public.vouchers%ROWTYPE;
  v_customer_uses INTEGER;
BEGIN
  IF p_user_id <> auth.uid() THEN RAISE EXCEPTION 'Voucher can only be redeemed by the signed-in customer'; END IF;
  SELECT * INTO v_voucher FROM public.vouchers WHERE id = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_voucher.max_uses IS NOT NULL AND v_voucher.uses_count + v_voucher.reserved_uses >= v_voucher.max_uses THEN RETURN FALSE; END IF;
  SELECT count(*) INTO v_customer_uses FROM public.voucher_redemptions WHERE voucher_id = p_voucher_id AND user_id = p_user_id;
  IF v_voucher.per_customer_limit IS NOT NULL AND v_customer_uses >= v_voucher.per_customer_limit THEN RETURN FALSE; END IF;
  UPDATE public.vouchers SET uses_count = uses_count + 1 WHERE id = p_voucher_id;
  INSERT INTO public.voucher_redemptions(voucher_id, order_id, user_id, discount)
  VALUES (p_voucher_id, p_order_id, p_user_id, p_discount)
  ON CONFLICT (voucher_id, order_id) DO NOTHING;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_voucher(UUID, UUID, UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_voucher(UUID, UUID, UUID, NUMERIC) TO authenticated;

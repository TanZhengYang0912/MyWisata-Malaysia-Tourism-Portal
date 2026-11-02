-- Prevent affiliate credit while an order still has an unresolved operational
-- obligation. Order rows are locked before attribution, case, or wallet rows.
CREATE OR REPLACE FUNCTION app_private.affiliate_order_release_blocker(p_order_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT lower(status) INTO v_status FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN 'order_missing'; END IF;
  IF v_status IN ('cancelled', 'refunded') THEN RETURN NULL; END IF;
  IF v_status NOT IN ('paid', 'completed') THEN RETURN 'order_not_paid'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.refunds r
    WHERE r.order_id = p_order_id
      AND (r.status IN ('pending', 'approved')
        OR (r.status <> 'processed' AND (
          nullif(btrim(r.provider_failure_code), '') IS NOT NULL
          OR nullif(btrim(r.provider_failure_message), '') IS NOT NULL
          OR nullif(btrim(r.provider_refund_id), '') IS NOT NULL
        )))
  ) THEN RETURN 'refund_review'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_order_exceptions e
    WHERE e.order_id = p_order_id
      AND (e.state <> 'resolved' OR e.resolution_code IS NULL)
  ) THEN RETURN 'order_exception_open'; END IF;

  -- Vendor settlement treats a verified no-show as releasable. Affiliate
  -- entitlement has no approved no-show rule, so keep this commission pending.
  IF EXISTS (
    SELECT 1 FROM public.event_order_exceptions e
    WHERE e.order_id = p_order_id
      AND e.kind = 'pickup_overdue'
      AND e.state = 'resolved'
      AND e.resolution_code = 'customer_no_show'
  ) THEN RETURN 'no_show_policy'; END IF;

  IF EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = p_order_id AND oi.event_location_id IS NOT NULL)
    AND EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = p_order_id AND oi.event_location_id IS NOT NULL
        AND (oi.fulfil_status IS DISTINCT FROM 'fulfilled' OR oi.fulfilled_at IS NULL)
    ) THEN RETURN 'pickup_unconfirmed'; END IF;

  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION app_private.affiliate_order_release_blocker(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.clear_affiliate_commission(
  p_attribution_id uuid,
  p_matured_before timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_attribution public.affiliate_attributions%ROWTYPE;
  v_owner public.users%ROWTYPE;
  v_order_id uuid;
  v_order_status text;
  v_owner_id uuid;
  v_amount_sen bigint;
  v_order_blocker text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT order_id INTO v_order_id FROM public.affiliate_attributions WHERE id = p_attribution_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'skipped'); END IF;

  -- Match event/refund writers: serialize on the order before taking the
  -- attribution lock, then re-read the order state after acquiring the lock.
  SELECT lower(status) INTO v_order_status FROM public.orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'affiliate_order_missing'; END IF;
  SELECT * INTO v_attribution FROM public.affiliate_attributions WHERE id = p_attribution_id FOR UPDATE;
  IF NOT FOUND OR v_attribution.status <> 'pending' THEN RETURN jsonb_build_object('outcome', 'skipped'); END IF;
  IF v_attribution.order_id <> v_order_id THEN RAISE EXCEPTION 'affiliate_order_changed'; END IF;

  -- Terminal order reversal takes precedence over a stale operational case.
  IF v_order_status IN ('cancelled', 'refunded') THEN
    UPDATE public.affiliate_attributions SET status = 'reversed', reversed_at = now() WHERE id = p_attribution_id;
    RETURN jsonb_build_object('outcome', 'reversed', 'reason', 'order ' || v_order_status);
  END IF;
  IF EXISTS (SELECT 1 FROM public.affiliate_guest_commission_reviews r
    WHERE r.attribution_id = p_attribution_id AND r.status = 'pending') THEN
    RETURN jsonb_build_object('outcome', 'review_required');
  END IF;
  IF p_matured_before IS NOT NULL AND v_attribution.created_at >= p_matured_before THEN
    RETURN jsonb_build_object('outcome', 'skipped');
  END IF;
  IF v_attribution.hold_until IS NOT NULL THEN RETURN jsonb_build_object('outcome', 'skipped'); END IF;

  v_order_blocker := app_private.affiliate_order_release_blocker(v_order_id);
  IF v_order_blocker IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'order_review_required', 'reason', v_order_blocker);
  END IF;

  SELECT l.user_id INTO v_owner_id
    FROM public.affiliate_clicks c JOIN public.affiliate_links l ON l.id = c.link_id
    WHERE c.id = v_attribution.click_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'affiliate_owner_missing'; END IF;
  SELECT * INTO v_owner FROM public.users WHERE id = v_owner_id FOR SHARE;
  IF NOT FOUND OR v_owner.status IS DISTINCT FROM 'active'
    OR v_owner.email_verified_at IS NULL OR v_owner.phone_verified_at IS NULL
    OR v_owner.profile_completed_at IS NULL OR NOT public.profile_completion_eligible(v_owner.id)
    OR v_owner.kyc_status IS DISTINCT FROM 'approved' THEN
    RETURN jsonb_build_object('outcome', 'skipped');
  END IF;
  IF EXISTS (SELECT 1 FROM public.vendors v WHERE v.owner_id = v_owner_id
    AND v.status IN ('pending', 'approved', 'suspended'))
    OR EXISTS (SELECT 1 FROM public.outlet_managers om WHERE om.user_id = v_owner_id) THEN
    RETURN jsonb_build_object('outcome', 'skipped');
  END IF;

  v_amount_sen := round(v_attribution.commission_amount * 100)::bigint;
  IF v_amount_sen <= 0 THEN RAISE EXCEPTION 'affiliate_amount_invalid'; END IF;
  INSERT INTO public.wallets(user_id) VALUES (v_owner_id) ON CONFLICT (user_id) DO NOTHING;
  PERFORM public.credit_earnings(v_owner_id, v_amount_sen, v_order_id,
    'Affiliate commission for order ' || left(v_order_id::text, 8));
  UPDATE public.affiliate_attributions SET status = 'confirmed', cleared_at = now(), confirmed_at = now()
    WHERE id = p_attribution_id;
  RETURN jsonb_build_object('outcome', 'confirmed', 'user_id', v_owner_id,
    'order_id', v_order_id, 'amount_rm', v_amount_sen::numeric / 100);
END;
$$;
REVOKE ALL ON FUNCTION public.clear_affiliate_commission(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_affiliate_commission(uuid,timestamptz) TO service_role;

-- Preserve the legacy pending-wallet release entry point. It follows the same
-- order-first lock protocol and applies the same fail-closed order policy.
CREATE OR REPLACE FUNCTION app_private.confirm_pending_earnings()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_candidate record;
  v_owner_id uuid;
  v_amount_sen bigint;
  v_wallet_id uuid;
  v_confirmed integer := 0;
  v_order_status text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
    AND (auth.uid() IS NULL OR NOT public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  FOR v_candidate IN
    SELECT aa.id, aa.order_id
    FROM public.affiliate_attributions aa
    WHERE aa.status = 'pending' AND aa.hold_until IS NOT NULL AND aa.hold_until <= now()
    ORDER BY aa.order_id, aa.id
  LOOP
    SELECT lower(status) INTO v_order_status FROM public.orders WHERE id = v_candidate.order_id FOR UPDATE;
    IF NOT FOUND OR v_order_status IN ('cancelled', 'refunded') THEN CONTINUE; END IF;
    SELECT aa.id, aa.order_id, aa.click_id, aa.commission_amount, al.user_id
      INTO v_candidate
      FROM public.affiliate_attributions aa
      JOIN public.affiliate_clicks ac ON ac.id = aa.click_id
      JOIN public.affiliate_links al ON al.id = ac.link_id
      JOIN public.users u ON u.id = al.user_id
      WHERE aa.id = v_candidate.id AND aa.status = 'pending'
        AND aa.hold_until IS NOT NULL AND aa.hold_until <= now()
        AND u.email_verified_at IS NOT NULL AND u.phone_verified_at IS NOT NULL
        AND u.profile_completed_at IS NOT NULL AND public.profile_completion_eligible(u.id)
        AND COALESCE(u.status, 'suspended') = 'active' AND u.kyc_status = 'approved'
        AND EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id = al.user_id AND r.name = 'customer')
        AND NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id = al.user_id AND r.name IN ('vendor_owner', 'outlet_manager'))
        AND NOT EXISTS (SELECT 1 FROM public.affiliate_guest_commission_reviews gr
          WHERE gr.attribution_id = aa.id AND gr.status = 'pending')
      FOR UPDATE OF aa, u;
    IF NOT FOUND OR app_private.affiliate_order_release_blocker(v_candidate.order_id) IS NOT NULL THEN
      CONTINUE;
    END IF;

    v_owner_id := v_candidate.user_id;
    v_amount_sen := round(v_candidate.commission_amount * 100)::bigint;
    SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = v_owner_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_amount_sen := LEAST(v_amount_sen,
      (SELECT pending_earnings_sen FROM public.wallets WHERE id = v_wallet_id));
    IF v_amount_sen <= 0 THEN CONTINUE; END IF;
    UPDATE public.wallets SET pending_earnings_sen = pending_earnings_sen - v_amount_sen,
      earnings_sen = earnings_sen + v_amount_sen, updated_at = now() WHERE id = v_wallet_id;
    INSERT INTO public.wallet_transactions(user_id, wallet_id, type, amount_sen, bucket, direction, note)
    VALUES
      (v_owner_id, v_wallet_id, 'earnings_confirm', v_amount_sen, 'pending_earnings', 'debit', 'Commission hold cleared — moving to available'),
      (v_owner_id, v_wallet_id, 'earnings_confirm', v_amount_sen, 'earnings', 'credit', 'Commission available after hold period');
    UPDATE public.affiliate_attributions SET status = 'confirmed', confirmed_at = now() WHERE id = v_candidate.id;
    v_confirmed := v_confirmed + 1;
  END LOOP;
  RETURN v_confirmed;
END;
$$;
REVOKE ALL ON FUNCTION app_private.confirm_pending_earnings() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.confirm_pending_earnings() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_pending_earnings()
RETURNS integer LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.confirm_pending_earnings();
$$;
REVOKE ALL ON FUNCTION public.confirm_pending_earnings() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_pending_earnings() TO authenticated, service_role;

-- A single bounded call enriches the current admin page; no write or broad scan.
CREATE OR REPLACE FUNCTION public.get_affiliate_order_release_preview(p_attribution_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_attribution_ids IS NULL OR cardinality(p_attribution_ids) > 50 THEN
    RAISE EXCEPTION 'affiliate_release_preview_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', aa.id,
    'reason', app_private.affiliate_order_release_blocker(aa.order_id)
  ) ORDER BY aa.id), '[]'::jsonb)
  INTO v_result
  FROM public.affiliate_attributions aa
  WHERE aa.id = ANY(p_attribution_ids) AND aa.status = 'pending';
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_affiliate_order_release_preview(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_affiliate_order_release_preview(uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';

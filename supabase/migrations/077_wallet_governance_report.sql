-- 077 — Wallet governance configuration and payout report completion
--
-- 073 introduced wallet.clearance_days, while the older reward RPC read the
-- legacy earnings.hold_days key. Keep the RPC signature stable, but make the
-- current governance setting authoritative for all newly-created rewards.

CREATE OR REPLACE FUNCTION public.credit_pending_recommendation(
  p_user_id         UUID,
  p_amount_sen      BIGINT,
  p_commission_type TEXT,
  p_conversion_id   UUID,
  p_order_id        UUID    DEFAULT NULL,
  p_commission_rate NUMERIC(5,4) DEFAULT NULL,
  p_note            TEXT    DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_wallet_id UUID;
  v_hold_days INT := 7;
  v_commission_id UUID;
BEGIN
  SELECT COALESCE(
    (SELECT NULLIF(value, '')::INT FROM public.platform_settings WHERE key = 'wallet.clearance_days'),
    (SELECT NULLIF(value, '')::INT FROM public.platform_settings WHERE key = 'earnings.hold_days'),
    7
  ) INTO v_hold_days;
  IF v_hold_days < 1 OR v_hold_days > 30 THEN
    v_hold_days := 7;
  END IF;

  SELECT id INTO v_wallet_id
    FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found for user %', p_user_id;
  END IF;

  IF p_commission_type = 'bonus' THEN
    INSERT INTO public.recommendation_commissions
      (recommender_id, conversion_id, commission_type, amount, status,
       hold_until, order_id, commission_rate)
    VALUES
      (p_user_id, p_conversion_id, 'bonus', p_amount_sen / 100.0, 'pending',
       now() + (v_hold_days || ' days')::INTERVAL, p_order_id, p_commission_rate)
    ON CONFLICT (conversion_id) WHERE commission_type = 'bonus'
    DO NOTHING
    RETURNING id INTO v_commission_id;
  ELSE
    INSERT INTO public.recommendation_commissions
      (recommender_id, conversion_id, commission_type, amount, status,
       hold_until, order_id, commission_rate)
    VALUES
      (p_user_id, p_conversion_id, p_commission_type, p_amount_sen / 100.0, 'pending',
       now() + (v_hold_days || ' days')::INTERVAL, p_order_id, p_commission_rate)
    ON CONFLICT (conversion_id, order_id)
      WHERE commission_type = 'ongoing' AND order_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_commission_id;
  END IF;

  IF v_commission_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.wallets
     SET pending_earnings_sen = pending_earnings_sen + p_amount_sen,
         updated_at = now()
   WHERE id = v_wallet_id;

  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, note)
  VALUES
    (p_user_id, v_wallet_id, 'earnings_pending', p_amount_sen,
     'pending_earnings', 'credit', COALESCE(p_note, 'Recommendation commission'));

  IF p_commission_type = 'bonus' THEN
    UPDATE public.recommendation_conversions
       SET first_sale_awarded_at = now(), first_sale_order_id = p_order_id
     WHERE id = p_conversion_id;
  END IF;

  RETURN v_commission_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_pending_recommendation(UUID, BIGINT, TEXT, UUID, UUID, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_pending_recommendation(UUID, BIGINT, TEXT, UUID, UUID, NUMERIC, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.generate_monthly_payout_report(
  p_period_start DATE,
  p_generated_by TEXT DEFAULT 'scheduler'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_period_end DATE;
  v_summary JSONB;
  v_report_id UUID;
BEGIN
  IF v_actor IS NOT NULL AND NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  IF p_generated_by NOT IN ('scheduler', 'super_admin') THEN
    RAISE EXCEPTION 'invalid_generated_by';
  END IF;
  v_period_end := (p_period_start + INTERVAL '1 month')::DATE;

  SELECT jsonb_build_object(
    'total_requested', COUNT(*),
    'total_approved', COUNT(*) FILTER (WHERE status IN ('approved','processing','paid','completed')),
    'total_rejected', COUNT(*) FILTER (WHERE status = 'rejected'),
    'total_completed', COUNT(*) FILTER (WHERE status IN ('paid','completed')),
    'total_failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'pending_count', COUNT(*) FILTER (WHERE status IN ('pending','pending_second_approval','hold','overdue')),
    'amount_requested_rm', COALESCE(SUM(amount), 0),
    'amount_approved_rm', COALESCE(SUM(amount) FILTER (WHERE status IN ('approved','processing','paid','completed')), 0),
    'amount_paid_rm', COALESCE(SUM(amount) FILTER (WHERE status IN ('paid','completed')), 0),
    'amount_rejected_rm', COALESCE(SUM(amount) FILTER (WHERE status = 'rejected'), 0),
    'amount_failed_rm', COALESCE(SUM(amount) FILTER (WHERE status = 'failed'), 0),
    'amount_reserved_rm', COALESCE(SUM(amount) FILTER (WHERE status IN ('pending','pending_second_approval','approved','processing','hold','overdue')), 0),
    'amount_withdrawn_rm', COALESCE(SUM(amount) FILTER (WHERE status IN ('paid','completed')), 0),
    'high_risk_count', (
      SELECT COUNT(*) FROM public.withdrawal_risk_assessments ra
       WHERE ra.withdrawal_id IN (
         SELECT id FROM public.withdrawal_requests
          WHERE (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE >= p_period_start
            AND (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE < v_period_end
       ) AND ra.risk_level = 'high'
    )
  ) INTO v_summary
  FROM public.withdrawal_requests
  WHERE (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE >= p_period_start
    AND (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE < v_period_end;

  INSERT INTO public.monthly_payout_reports
    (period_start, timezone, summary, generated_at, generated_by)
  VALUES (p_period_start, 'Asia/Kuala_Lumpur', v_summary, now(), p_generated_by)
  ON CONFLICT (period_start) DO UPDATE
    SET summary = EXCLUDED.summary, generated_at = EXCLUDED.generated_at,
        generated_by = EXCLUDED.generated_by
  RETURNING id INTO v_report_id;

  RETURN jsonb_build_object(
    'report_id', v_report_id, 'period_start', p_period_start,
    'period_end', v_period_end, 'summary', v_summary
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_monthly_payout_report(DATE, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_monthly_payout_report(DATE, TEXT)
  TO service_role;

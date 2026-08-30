-- Payout fee accounting and finance-report detail dimensions.

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS payout_fee NUMERIC(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.withdrawal_requests'::regclass
       AND conname = 'withdrawal_requests_payout_fee_nonnegative'
  ) THEN
    ALTER TABLE public.withdrawal_requests
      ADD CONSTRAINT withdrawal_requests_payout_fee_nonnegative CHECK (payout_fee >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_withdrawal_payout_fee(
  p_withdrawal_id UUID,
  p_fee_sen BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_fee_sen IS NULL OR p_fee_sen < 0 THEN RAISE EXCEPTION 'invalid_payout_fee'; END IF;

  UPDATE public.withdrawal_requests
     SET payout_fee = p_fee_sen::NUMERIC / 100,
         updated_at = now()
   WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;

  RETURN jsonb_build_object('withdrawal_id', p_withdrawal_id, 'payout_fee_sen', p_fee_sen);
END;
$$;

REVOKE ALL ON FUNCTION public.record_withdrawal_payout_fee(UUID, BIGINT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.record_withdrawal_payout_fee(UUID, BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION public.generate_monthly_payout_report(
  p_period_start DATE,
  p_generated_by TEXT DEFAULT 'scheduler'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_period_end DATE;
  v_summary JSONB;
  v_details JSONB;
  v_report_id UUID;
BEGIN
  IF v_actor IS NOT NULL AND NOT public.is_super_admin(v_actor) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  IF p_generated_by NOT IN ('scheduler', 'super_admin') THEN RAISE EXCEPTION 'invalid_generated_by'; END IF;
  v_period_end := (p_period_start + INTERVAL '1 month')::DATE;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', detail.user_id,
    'user_email', detail.user_email,
    'date', detail.report_date,
    'source', detail.source,
    'request_count', detail.request_count,
    'amount_rm', detail.amount_rm,
    'payout_fees_rm', detail.payout_fees_rm
  ) ORDER BY detail.report_date, detail.user_email, detail.source), '[]'::jsonb)
    INTO v_details
    FROM (
      SELECT
        wr.user_id,
        u.email AS user_email,
        (wr.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE AS report_date,
        COALESCE(pd.provider, 'stripe_connect') AS source,
        COUNT(*) AS request_count,
        COALESCE(SUM(wr.amount), 0) AS amount_rm,
        COALESCE(SUM(wr.payout_fee), 0) AS payout_fees_rm
      FROM public.withdrawal_requests wr
      JOIN public.users u ON u.id = wr.user_id
      LEFT JOIN public.payout_destinations pd ON pd.id = wr.destination_id
      WHERE (wr.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE >= p_period_start
        AND (wr.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE < v_period_end
      GROUP BY wr.user_id, u.email, report_date, source
    ) detail;

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
    'payout_fees_rm', COALESCE(SUM(payout_fee), 0),
    'high_risk_count', (
      SELECT COUNT(*) FROM public.withdrawal_risk_assessments ra
       WHERE ra.withdrawal_id IN (
         SELECT id FROM public.withdrawal_requests
          WHERE (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE >= p_period_start
            AND (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE < v_period_end
       ) AND ra.risk_level = 'high'
    ),
    'details', v_details
  ) INTO v_summary
  FROM public.withdrawal_requests
  WHERE (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE >= p_period_start
    AND (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE < v_period_end;

  INSERT INTO public.monthly_payout_reports(period_start, timezone, summary, generated_at, generated_by)
  VALUES (p_period_start, 'Asia/Kuala_Lumpur', v_summary, now(), p_generated_by)
  ON CONFLICT (period_start) DO UPDATE
    SET summary = EXCLUDED.summary, generated_at = EXCLUDED.generated_at, generated_by = EXCLUDED.generated_by
  RETURNING id INTO v_report_id;

  RETURN jsonb_build_object(
    'report_id', v_report_id,
    'period_start', p_period_start,
    'period_end', v_period_end,
    'summary', v_summary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_monthly_payout_report(DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_monthly_payout_report(DATE, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

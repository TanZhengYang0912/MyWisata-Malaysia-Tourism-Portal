-- Make monthly payout reports explicit about the two different meanings of
-- pending money: pending withdrawal requests and pending wallet earnings.

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
  v_wallet_totals JSONB;
  v_report_id UUID;
BEGIN
  IF v_actor IS NOT NULL AND NOT public.is_super_admin(v_actor) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  IF p_generated_by NOT IN ('scheduler', 'super_admin') THEN RAISE EXCEPTION 'invalid_generated_by'; END IF;
  v_period_end := (p_period_start + INTERVAL '1 month')::DATE;

  SELECT jsonb_build_object(
    'pending_earnings_amount_rm', COALESCE(SUM(w.pending_balance), 0),
    'available_amount_rm', COALESCE(SUM(w.available_balance), 0)
  )
    INTO v_wallet_totals
    FROM public.wallets w;

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
        COALESCE(pd.provider, wr.destination_provider, 'stripe_connect') AS source,
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
    'pending_withdrawal_amount_rm', COALESCE(SUM(amount) FILTER (WHERE status IN ('pending','pending_second_approval','hold','overdue')), 0),
    'reserved_amount_rm', COALESCE(SUM(amount) FILTER (WHERE status IN ('pending','pending_second_approval','approved','processing','hold','overdue')), 0),
    -- Backwards-compatible key consumed by existing exports and dashboards.
    'amount_reserved_rm', COALESCE(SUM(amount) FILTER (WHERE status IN ('pending','pending_second_approval','approved','processing','hold','overdue')), 0),
    'amount_withdrawn_rm', COALESCE(SUM(amount) FILTER (WHERE status IN ('paid','completed')), 0),
    'payout_fees_rm', COALESCE(SUM(payout_fee), 0),
    'pending_earnings_amount_rm', v_wallet_totals -> 'pending_earnings_amount_rm',
    'available_amount_rm', v_wallet_totals -> 'available_amount_rm',
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

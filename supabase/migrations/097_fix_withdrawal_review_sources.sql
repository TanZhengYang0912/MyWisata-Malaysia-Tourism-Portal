-- Repair the withdrawal evidence projection without changing ledger rows or
-- adding a duplicate reference column. wallet_transactions has order_id and
-- withdrawal_id; reference_id belongs to the legacy wallet_ledger table.

CREATE OR REPLACE FUNCTION public.get_withdrawal_review_sources(
  p_withdrawal_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_risk JSONB;
BEGIN
  IF NOT is_approver(auth.uid()) THEN RAISE EXCEPTION 'approver_required'; END IF;
  SELECT user_id INTO v_user_id FROM public.withdrawal_requests WHERE id = p_withdrawal_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;

  SELECT snapshot INTO v_risk
    FROM public.withdrawal_risk_assessments
   WHERE withdrawal_id = p_withdrawal_id
   ORDER BY assessed_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'rewardSources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', wt.id, 'type', wt.type, 'amountSen', wt.amount_sen,
        'direction', wt.direction, 'bucket', wt.bucket,
        'referenceId', COALESCE(wt.order_id, wt.withdrawal_id),
        'orderId', wt.order_id, 'createdAt', wt.created_at, 'note', wt.note
      ) ORDER BY wt.created_at DESC)
      FROM public.wallet_transactions wt
      WHERE wt.user_id = v_user_id AND wt.direction = 'credit'
        AND wt.type IN ('earnings_pending','earnings_confirm','earnings_reverse')
    ), '[]'::jsonb),
    'affiliateSources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', wt.id, 'type', wt.type, 'amountSen', wt.amount_sen,
        'direction', wt.direction, 'bucket', wt.bucket,
        'referenceId', COALESCE(wt.order_id, wt.withdrawal_id),
        'orderId', wt.order_id, 'createdAt', wt.created_at, 'note', wt.note
      ) ORDER BY wt.created_at DESC)
      FROM public.wallet_transactions wt
      WHERE wt.user_id = v_user_id AND wt.direction = 'credit'
        AND wt.type = 'earnings'
        AND (wt.note ILIKE '%affiliate%' OR wt.idempotency_key ILIKE 'affiliate:%')
    ), '[]'::jsonb),
    'walletTransactions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', source.id, 'type', source.type, 'amountSen', source.amount_sen,
        'direction', source.direction, 'bucket', source.bucket,
        'referenceId', COALESCE(source.order_id, source.withdrawal_id),
        'orderId', source.order_id, 'withdrawalId', source.withdrawal_id,
        'createdAt', source.created_at, 'note', source.note
      ) ORDER BY source.created_at DESC)
      FROM (
        SELECT wt.*
          FROM public.wallet_transactions wt
         WHERE wt.user_id = v_user_id
         ORDER BY wt.created_at DESC
         OFFSET GREATEST(p_offset, 0)
         LIMIT LEAST(GREATEST(p_limit, 1), 100)
      ) source
    ), '[]'::jsonb),
    'fraudFlags', COALESCE(v_risk->'fraud_flags', v_risk->'risk_factors', '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_withdrawal_review_sources(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_withdrawal_review_sources(UUID, INTEGER, INTEGER) TO authenticated;

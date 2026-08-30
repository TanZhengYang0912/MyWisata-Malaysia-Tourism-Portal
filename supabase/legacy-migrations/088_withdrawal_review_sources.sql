-- Read-only withdrawal review projections. These functions expose safe summaries
-- and wallet ledger rows only; KYC documents, account numbers, PINs, and secrets
-- are intentionally excluded.

CREATE OR REPLACE FUNCTION public.get_withdrawal_notification_snapshot(p_withdrawal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot JSONB;
BEGIN
  SELECT jsonb_build_object(
    'customer', jsonb_build_object(
      'id', u.id,
      'displayName', COALESCE(u.full_name, 'Customer'),
      'email', u.email
    ),
    'requestTime', wr.created_at,
    'kycStatus', COALESCE(u.kyc_status, 'unverified'),
    'risk', jsonb_build_object(
      'level', COALESCE(risk.risk_level, 'review'),
      'reasons', COALESCE(risk.snapshot->'risk_factors', risk.snapshot->'fraud_flags', '[]'::jsonb)
    ),
    'sourceTotals', jsonb_build_object(
      'rewardSen', COALESCE((SELECT SUM(wt.amount_sen) FROM public.wallet_transactions wt WHERE wt.user_id = wr.user_id AND wt.direction = 'credit' AND wt.type IN ('reward_pending','reward_cleared','recommendation_reward_reversed')), 0),
      'affiliateSen', COALESCE((SELECT SUM(wt.amount_sen) FROM public.wallet_transactions wt WHERE wt.user_id = wr.user_id AND wt.direction = 'credit' AND wt.type = 'affiliate_commission'), 0),
      'otherSen', COALESCE((SELECT SUM(wt.amount_sen) FROM public.wallet_transactions wt WHERE wt.user_id = wr.user_id AND wt.direction = 'credit' AND wt.type NOT IN ('reward_pending','reward_cleared','recommendation_reward_reversed','affiliate_commission')), 0)
    ),
    'destination', jsonb_build_object(
      'type', COALESCE(wr.destination_provider, pd.provider, 'unknown'),
      'maskedReference', COALESCE(wr.destination_masked_ref, pd.masked_ref, 'masked')
    )
  ) INTO v_snapshot
  FROM public.withdrawal_requests wr
  JOIN public.users u ON u.id = wr.user_id
  LEFT JOIN public.payout_destinations pd ON pd.id = wr.destination_id
  LEFT JOIN LATERAL (
    SELECT risk_level, snapshot
      FROM public.withdrawal_risk_assessments
     WHERE withdrawal_id = wr.id
     ORDER BY assessed_at DESC
     LIMIT 1
  ) risk ON TRUE
  WHERE wr.id = p_withdrawal_id;

  IF v_snapshot IS NULL THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  RETURN v_snapshot;
END;
$$;

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
        'direction', wt.direction, 'bucket', wt.bucket, 'referenceId', wt.reference_id,
        'orderId', wt.order_id, 'createdAt', wt.created_at, 'note', wt.note
      ) ORDER BY wt.created_at DESC)
      FROM public.wallet_transactions wt
      WHERE wt.user_id = v_user_id AND wt.direction = 'credit'
        AND wt.type IN ('reward_pending','reward_cleared','recommendation_reward_reversed')
    ), '[]'::jsonb),
    'affiliateSources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', wt.id, 'type', wt.type, 'amountSen', wt.amount_sen,
        'direction', wt.direction, 'bucket', wt.bucket, 'referenceId', wt.reference_id,
        'orderId', wt.order_id, 'createdAt', wt.created_at, 'note', wt.note
      ) ORDER BY wt.created_at DESC)
      FROM public.wallet_transactions wt
      WHERE wt.user_id = v_user_id AND wt.direction = 'credit' AND wt.type = 'affiliate_commission'
    ), '[]'::jsonb),
    'walletTransactions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', wt.id, 'type', wt.type, 'amountSen', wt.amount_sen,
        'direction', wt.direction, 'bucket', wt.bucket, 'referenceId', wt.reference_id,
        'orderId', wt.order_id, 'withdrawalId', wt.withdrawal_id,
        'createdAt', wt.created_at, 'note', wt.note
      ) ORDER BY wt.created_at DESC)
      FROM public.wallet_transactions wt
      WHERE wt.user_id = v_user_id
      OFFSET GREATEST(p_offset, 0)
      LIMIT LEAST(GREATEST(p_limit, 1), 100)
    ), '[]'::jsonb),
    'fraudFlags', COALESCE(v_risk->'fraud_flags', v_risk->'risk_factors', '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_withdrawal_notification_snapshot(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_withdrawal_review_sources(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_withdrawal_notification_snapshot(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_withdrawal_review_sources(UUID, INTEGER, INTEGER) TO authenticated;

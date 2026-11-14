-- Keep recommendation commissions compatible with the canonical schema while
-- preserving legacy per-order/status values where they already exist.
ALTER TABLE public.recommendation_commissions
  ADD COLUMN IF NOT EXISTS order_id UUID,
  ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'pending';

UPDATE public.recommendation_commissions AS commission
   SET order_id = conversion.first_sale_order_id
  FROM public.recommendation_conversions AS conversion
 WHERE commission.conversion_id = conversion.id
   AND commission.order_id IS NULL
   AND conversion.first_sale_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_admin_order_money_reconciliation(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_search TEXT DEFAULT '',
  p_status TEXT DEFAULT NULL,
  p_net TEXT DEFAULT 'all',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to
     OR p_page IS NULL OR p_page < 1 OR p_page_size IS NULL OR p_page_size NOT IN (15, 25, 50, 10001)
     OR length(COALESCE(p_search, '')) > 100 OR length(COALESCE(p_status, '')) > 64
     OR COALESCE(p_net, 'all') NOT IN ('all', 'positive', 'zero', 'negative') THEN
    RAISE EXCEPTION 'invalid_reconciliation_query' USING ERRCODE = '22023';
  END IF;

  WITH settlement_totals AS (
    SELECT
      settlement.order_id,
      SUM(settlement.gross_sen)::BIGINT AS gross_sen,
      SUM(settlement.platform_fee_sen)::BIGINT AS platform_fee_sen,
      SUM(settlement.vendor_net_sen - settlement.reversed_amount_sen)::BIGINT AS vendor_net_sen
    FROM public.order_settlements AS settlement
    JOIN public.orders AS order_row ON order_row.id = settlement.order_id
    WHERE order_row.created_at >= p_from AND order_row.created_at < p_to
    GROUP BY settlement.order_id
  ), affiliate_totals AS (
    SELECT attribution.order_id,
      SUM(ROUND(attribution.commission_amount * 100))::BIGINT AS payout_sen
    FROM public.affiliate_attributions AS attribution
    JOIN settlement_totals AS included ON included.order_id = attribution.order_id
    WHERE attribution.status NOT IN ('rejected', 'reversed')
    GROUP BY attribution.order_id
  ), recommendation_totals AS (
    SELECT COALESCE(commission.order_id, conversion.first_sale_order_id) AS order_id,
      SUM(ROUND(commission.amount * 100))::BIGINT AS payout_sen
    FROM public.recommendation_commissions AS commission
    LEFT JOIN public.recommendation_conversions AS conversion ON conversion.id = commission.conversion_id
    JOIN settlement_totals AS included
      ON included.order_id = COALESCE(commission.order_id, conversion.first_sale_order_id)
    WHERE COALESCE(commission.status, 'pending') NOT IN ('rejected', 'reversed', 'cancelled')
    GROUP BY COALESCE(commission.order_id, conversion.first_sale_order_id)
  ), order_rows AS (
    SELECT
      order_row.id AS order_id,
      order_row.display_id,
      order_row.status,
      order_row.paid_at,
      settlement.gross_sen,
      settlement.platform_fee_sen,
      settlement.vendor_net_sen,
      COALESCE(affiliate.payout_sen, 0)::BIGINT AS affiliate_payout_sen,
      COALESCE(recommendation.payout_sen, 0)::BIGINT AS recommendation_payout_sen,
      (settlement.platform_fee_sen - COALESCE(affiliate.payout_sen, 0)
        - COALESCE(recommendation.payout_sen, 0))::BIGINT AS platform_net_sen
    FROM settlement_totals AS settlement
    JOIN public.orders AS order_row ON order_row.id = settlement.order_id
    LEFT JOIN affiliate_totals AS affiliate ON affiliate.order_id = order_row.id
    LEFT JOIN recommendation_totals AS recommendation ON recommendation.order_id = order_row.id
  ), filtered_rows AS (
    SELECT * FROM order_rows AS report
    WHERE (COALESCE(p_search, '') = '' OR COALESCE(report.display_id, '') ILIKE '%' || p_search || '%')
      AND (p_status IS NULL OR p_status = 'all' OR report.status = p_status)
      AND (COALESCE(p_net, 'all') = 'all'
        OR (p_net = 'positive' AND report.platform_net_sen > 0)
        OR (p_net = 'zero' AND report.platform_net_sen = 0)
        OR (p_net = 'negative' AND report.platform_net_sen < 0))
  ), totals AS (
    SELECT
      COUNT(*)::INTEGER AS total,
      COALESCE(SUM(gross_sen), 0)::BIGINT AS gross_sen,
      COALESCE(SUM(platform_fee_sen), 0)::BIGINT AS platform_fee_sen,
      COALESCE(SUM(vendor_net_sen), 0)::BIGINT AS vendor_net_sen,
      COALESCE(SUM(affiliate_payout_sen), 0)::BIGINT AS affiliate_payout_sen,
      COALESCE(SUM(recommendation_payout_sen), 0)::BIGINT AS recommendation_payout_sen,
      COALESCE(SUM(platform_net_sen), 0)::BIGINT AS platform_net_sen,
      COUNT(*) FILTER (WHERE platform_net_sen < 0)::INTEGER AS negative_orders
    FROM filtered_rows
  ), page_rows AS (
    SELECT report.*
    FROM filtered_rows AS report
    ORDER BY report.paid_at DESC NULLS LAST, report.order_id ASC
    LIMIT p_page_size OFFSET LEAST(
      (p_page::BIGINT - 1) * p_page_size,
      GREATEST(0, (SELECT CEIL(COUNT(*)::NUMERIC / p_page_size)::INTEGER - 1 FROM filtered_rows) * p_page_size)
    )
  ), status_options AS (
    SELECT COALESCE(jsonb_agg(status ORDER BY status), '[]'::JSONB) AS values
    FROM (SELECT DISTINCT status FROM order_rows ORDER BY status) AS statuses
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'orderId', report.order_id,
        'orderDisplayId', report.display_id,
        'status', report.status,
        'paidAt', report.paid_at,
        'grossSen', report.gross_sen,
        'platformFeeSen', report.platform_fee_sen,
        'vendorNetSen', report.vendor_net_sen,
        'affiliatePayoutSen', report.affiliate_payout_sen,
        'recommendationPayoutSen', report.recommendation_payout_sen,
        'platformNetSen', report.platform_net_sen,
        'platformNetNegative', report.platform_net_sen < 0
      ) ORDER BY report.paid_at DESC NULLS LAST, report.order_id ASC)
      FROM page_rows AS report
    ), '[]'::JSONB),
    'total', totals.total,
    'statusOptions', status_options.values,
    'page', LEAST(p_page, GREATEST(1, CEIL(totals.total::NUMERIC / p_page_size)::INTEGER)),
    'pageSize', p_page_size,
    'totals', jsonb_build_object(
      'grossSen', totals.gross_sen,
      'platformFeeSen', totals.platform_fee_sen,
      'vendorNetSen', totals.vendor_net_sen,
      'affiliatePayoutSen', totals.affiliate_payout_sen,
      'recommendationPayoutSen', totals.recommendation_payout_sen,
      'platformNetSen', totals.platform_net_sen,
      'negativeOrders', totals.negative_orders
    )
  ) INTO v_result
  FROM totals CROSS JOIN status_options;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_order_money_reconciliation(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_order_money_reconciliation(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;

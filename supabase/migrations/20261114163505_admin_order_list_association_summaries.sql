-- Return a bounded per-order preview and exact association counts for one list page.
CREATE OR REPLACE FUNCTION public.admin_order_list_association_summaries(p_order_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_order_ids IS NULL OR cardinality(p_order_ids) > 25 THEN RAISE EXCEPTION 'invalid_order_page'; END IF;

  SELECT coalesce(jsonb_object_agg(summary.order_id::text, summary.value), '{}'::jsonb)
  INTO v_result
  FROM (
    SELECT requested.order_id,
      jsonb_build_object(
        'items', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', item.id, 'productName', item.product_name, 'quantity', item.quantity,
            'lineTotal', item.line_total, 'fulfilStatus', item.fulfil_status,
            'eventListingId', item.event_listing_id, 'pickupDate', item.pickup_date,
            'vendorId', item.vendor_id, 'vendorName', vendor.name,
            'outletId', item.outlet_id, 'outletName', outlet.name
          ) ORDER BY item.created_at ASC, item.id ASC)
          FROM (
            SELECT * FROM public.order_items WHERE order_id = requested.order_id
            ORDER BY created_at ASC, id ASC LIMIT 3
          ) AS item
          LEFT JOIN public.vendors AS vendor ON vendor.id = item.vendor_id
          LEFT JOIN public.outlets AS outlet ON outlet.id = item.outlet_id
        ), '[]'::jsonb),
        'itemCount', (SELECT count(*) FROM public.order_items WHERE order_id = requested.order_id),
        'latestPayment', (
          SELECT jsonb_build_object('id', payment.id, 'method', payment.method, 'provider', payment.provider,
            'status', payment.status, 'amount', payment.amount, 'created_at', payment.created_at)
          FROM public.payments AS payment WHERE payment.order_id = requested.order_id
          ORDER BY payment.created_at DESC, payment.id DESC LIMIT 1
        ),
        'paymentCount', (SELECT count(*) FROM public.payments WHERE order_id = requested.order_id)
      ) AS value
    FROM unnest(p_order_ids) AS requested(order_id)
  ) AS summary;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_order_list_association_summaries(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_order_list_association_summaries(uuid[]) TO service_role;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS retail_qr_scanned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS order_items_retail_pickup_scope_idx
  ON public.order_items (vendor_id, outlet_id, order_id)
  WHERE retail_qr_scanned_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_logs_retail_pickup_history_idx
  ON public.audit_logs (created_at DESC, entity_id)
  WHERE action = 'retail_pickup.fulfilled' AND entity_type = 'order_item';

CREATE OR REPLACE FUNCTION public.fulfil_retail_pickup(
  p_order_id UUID,
  p_order_item_id UUID,
  p_vendor_id UUID,
  p_outlet_id UUID,
  p_operator_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item public.order_items%ROWTYPE;
  v_vendor public.vendors%ROWTYPE;
  v_outlet public.outlets%ROWTYPE;
  v_category_slug TEXT;
  v_product_type TEXT;
  v_requires_booking BOOLEAN;
  v_now TIMESTAMPTZ := now();
  v_refund_paused BOOLEAN;
BEGIN
  IF p_operator_id IS NULL OR p_order_id IS NULL OR p_order_item_id IS NULL
     OR p_vendor_id IS NULL OR p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'retail_pickup_not_found';
  END IF;

  -- Match refund request's order-first lock order. Do not hold refund locks.
  SELECT * INTO v_order
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND OR lower(v_order.status) NOT IN ('paid', 'completed') THEN
    RAISE EXCEPTION 'retail_order_not_paid';
  END IF;

  SELECT * INTO v_item
    FROM public.order_items
   WHERE id = p_order_item_id
     AND order_id = p_order_id
     AND vendor_id = p_vendor_id
     AND outlet_id = p_outlet_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retail_pickup_not_found'; END IF;
  IF v_item.fulfil_status = 'fulfilled' OR v_item.retail_qr_scanned_at IS NOT NULL THEN
    RAISE EXCEPTION 'retail_pickup_already_fulfilled';
  END IF;
  IF v_item.fulfil_status NOT IN ('pending', 'ready') THEN
    RAISE EXCEPTION 'retail_pickup_not_available';
  END IF;

  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id;
  SELECT * INTO v_outlet FROM public.outlets WHERE id = p_outlet_id;
  IF v_vendor.status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'retail_vendor_unavailable'; END IF;
  IF v_outlet.vendor_id IS DISTINCT FROM p_vendor_id OR v_outlet.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'retail_pickup_outlet_unavailable';
  END IF;
  IF v_vendor.owner_id IS DISTINCT FROM p_operator_id AND NOT EXISTS (
    SELECT 1 FROM public.outlet_managers om
     WHERE om.user_id = p_operator_id AND om.outlet_id = p_outlet_id
  ) THEN
    RAISE EXCEPTION 'retail_operator_forbidden';
  END IF;

  SELECT c.slug, p.product_type, p.requires_booking
    INTO v_category_slug, v_product_type, v_requires_booking
    FROM public.products p
    JOIN public.categories c ON c.id = p.category_id
   WHERE p.id = v_item.product_id;
  IF NOT FOUND OR v_category_slug IS DISTINCT FROM 'retail'
     OR v_requires_booking IS DISTINCT FROM FALSE
     OR v_product_type IS DISTINCT FROM 'product'
     OR v_item.event_location_id IS NOT NULL
     OR v_item.event_listing_id IS NOT NULL
     OR v_item.slot_starts_at IS NOT NULL THEN
    RAISE EXCEPTION 'retail_pickup_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.refunds r
     WHERE r.order_id = p_order_id
       AND (
         lower(coalesce(r.status, '')) IN ('pending', 'approved', 'processed')
         OR lower(coalesce(r.status, '')) NOT IN ('failed', 'rejected')
         OR r.provider_refund_id IS NOT NULL
         OR r.provider_failure_code IS NOT NULL
         OR r.provider_failure_message IS NOT NULL
       )
  ) INTO v_refund_paused;
  IF v_refund_paused THEN RAISE EXCEPTION 'retail_refund_active'; END IF;

  PERFORM pg_catalog.set_config('app.retail_pickup_rpc', 'on', true);
  UPDATE public.order_items
     SET retail_qr_scanned_at = v_now,
         fulfil_status = 'fulfilled',
         fulfilled_at = v_now
   WHERE id = p_order_item_id
     AND order_id = p_order_id
     AND vendor_id = p_vendor_id
     AND outlet_id = p_outlet_id
     AND fulfil_status IN ('pending', 'ready')
     AND retail_qr_scanned_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'retail_pickup_already_fulfilled'; END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    p_operator_id,
    'retail_pickup.fulfilled',
    'order_item',
    p_order_item_id,
    jsonb_build_object('fulfil_status', v_item.fulfil_status),
    jsonb_build_object(
      'order_id', p_order_id,
      'vendor_id', p_vendor_id,
      'outlet_id', p_outlet_id,
      'product_name', v_item.product_name,
      'variant_name', v_item.variant_name,
      'quantity', v_item.quantity,
      'fulfil_status', 'fulfilled'
    ),
    'Retail order line handed over after signed QR verification'
  );

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'orderItemId', p_order_item_id,
    'status', 'fulfilled',
    'quantity', v_item.quantity,
    'fulfilledAt', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fulfil_retail_pickup(UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfil_retail_pickup(UUID, UUID, UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.list_vendor_redemption_history(
  p_vendor_id UUID,
  p_scope_outlet_ids UUID[],
  p_outlet_id UUID,
  p_kind TEXT,
  p_query TEXT,
  p_page INTEGER,
  p_page_size INTEGER
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH args AS (
    SELECT greatest(1, coalesce(p_page, 1)) AS requested_page,
      least(50, greatest(1, coalesce(p_page_size, 15))) AS page_size,
      lower(trim(coalesce(p_query, ''))) AS search_query
  ), records AS (
    SELECT r.id::TEXT AS id, 'voucher'::TEXT AS kind, r.redeemed_at,
      o.id AS outlet_id, coalesce(o.name, 'Assigned outlet') AS outlet_name,
      concat_ws(', ', o.city, o.state) AS outlet_location,
      coalesce(v.code, '—') AS item_code, coalesce(v.name, 'Store Voucher') AS item_name,
      CASE WHEN v.voucher_type = 'percent' THEN coalesce(v.discount_value, 0)::TEXT || '% OFF'
        WHEN v.voucher_type = 'fixed' THEN 'RM' || to_char(coalesce(v.discount_value, 0), 'FM999999990.00') || ' OFF'
        ELSE 'Buy 1 Free 1' END AS item_details,
      coalesce(customer.full_name, 'Verified Customer') AS customer_name, coalesce(customer.email, '—') AS customer_email,
      staff.full_name AS staff_name, staff.email AS staff_email, coalesce(v.discount_value, 0)::NUMERIC AS discount_value,
      0::INTEGER AS ticket_admissions
    FROM public.voucher_store_redemptions r
    JOIN public.vouchers v ON v.id = r.voucher_id
    JOIN public.outlets o ON o.id = r.outlet_id AND o.vendor_id = p_vendor_id
    LEFT JOIN public.users customer ON customer.id = r.user_id
    LEFT JOIN public.users staff ON staff.id = r.redeemed_by
    WHERE r.vendor_id = p_vendor_id AND r.outlet_id = ANY(coalesce(p_scope_outlet_ids, ARRAY[]::UUID[]))
      AND (p_outlet_id IS NULL OR r.outlet_id = p_outlet_id) AND p_kind IN ('all', 'voucher')
    UNION ALL
    SELECT e.id::TEXT, 'ticket', e.scanned_at, o.id, coalesce(o.name, 'Assigned outlet'), concat_ws(', ', o.city, o.state),
      coalesce(b.display_id, upper(left(b.id::TEXT, 8))), coalesce(oi.product_name, 'Experience Ticket'),
      coalesce(e.entries_admitted, 0)::TEXT || ' entries admitted', coalesce(u.full_name, 'Guest Ticket Holder'),
      coalesce(u.email, '—'), NULL::TEXT, NULL::TEXT, 0::NUMERIC, greatest(coalesce(e.entries_admitted, 0), 0)::INTEGER
    FROM public.check_in_events e
    JOIN public.bookings b ON b.id = e.booking_id
    JOIN public.order_items oi ON oi.id = b.order_item_id AND oi.vendor_id = p_vendor_id AND oi.outlet_id = e.outlet_id
    JOIN public.outlets o ON o.id = e.outlet_id AND o.vendor_id = p_vendor_id
    LEFT JOIN public.users u ON u.id = b.customer_id
    WHERE e.vendor_id = p_vendor_id AND e.outlet_id = ANY(coalesce(p_scope_outlet_ids, ARRAY[]::UUID[]))
      AND (p_outlet_id IS NULL OR e.outlet_id = p_outlet_id) AND p_kind IN ('all', 'ticket')
    UNION ALL
    SELECT b.id::TEXT, 'ticket', b.check_in_at, o.id, coalesce(o.name, 'Assigned outlet'), concat_ws(', ', o.city, o.state),
      coalesce(b.display_id, upper(left(b.id::TEXT, 8))), coalesce(oi.product_name, 'Experience Ticket'),
      coalesce(tp.entries_used, oi.quantity, 1)::TEXT || ' entries admitted', coalesce(u.full_name, 'Guest Ticket Holder'),
      coalesce(u.email, '—'), NULL::TEXT, NULL::TEXT, 0::NUMERIC, greatest(coalesce(tp.entries_used, oi.quantity, 1), 0)::INTEGER
    FROM public.bookings b
    JOIN public.order_items oi ON oi.id = b.order_item_id AND oi.vendor_id = p_vendor_id
    JOIN public.outlets o ON o.id = oi.outlet_id AND o.vendor_id = p_vendor_id
    LEFT JOIN public.users u ON u.id = b.customer_id
    LEFT JOIN public.ticket_passes tp ON tp.booking_id = b.id
    WHERE b.check_in_at IS NOT NULL AND oi.outlet_id = ANY(coalesce(p_scope_outlet_ids, ARRAY[]::UUID[]))
      AND (p_outlet_id IS NULL OR oi.outlet_id = p_outlet_id) AND p_kind IN ('all', 'ticket')
      AND NOT EXISTS (SELECT 1 FROM public.check_in_events e WHERE e.booking_id = b.id)
    UNION ALL
    SELECT a.id::TEXT, 'event_pickup', a.created_at, loc.id, coalesce(loc.name, 'Event location'), coalesce(loc.address, ''),
      upper(left(a.entity_id::TEXT, 8)),
      coalesce((SELECT string_agg(DISTINCT item->>'name', ', ') FROM jsonb_array_elements(coalesce(a.after_data->'item_details', '[]'::JSONB)) AS elements(item)), 'Event pickup'),
      'Collected', coalesce(customer.full_name, 'Verified Customer'), coalesce(customer.email, '—'), staff.full_name, staff.email,
      0::NUMERIC, 0::INTEGER
    FROM public.audit_logs a
    LEFT JOIN public.orders ord ON ord.id = a.entity_id
    LEFT JOIN public.users customer ON customer.id = ord.user_id
    LEFT JOIN public.users staff ON staff.id = a.actor_id
    LEFT JOIN public.promotion_campaign_locations loc ON loc.id = nullif(a.after_data->>'location_id', '')::UUID
    WHERE a.action = 'event_pickup.fulfilled' AND a.entity_type = 'order'
      AND a.after_data->>'vendor_id' = p_vendor_id::TEXT AND (p_outlet_id IS NULL OR loc.id = p_outlet_id)
      AND p_kind IN ('all', 'event_pickup')
    UNION ALL
    SELECT a.id::TEXT, 'retail_pickup', a.created_at, o.id, coalesce(o.name, 'Assigned outlet'), concat_ws(', ', o.city, o.state),
      upper(left(oi.order_id::TEXT, 8)), coalesce(oi.product_name, 'Retail item'), 'Quantity: ' || coalesce(oi.quantity, 0)::TEXT,
      coalesce(customer.full_name, 'Verified Customer'), coalesce(customer.email, '—'), staff.full_name, staff.email,
      0::NUMERIC, 0::INTEGER
    FROM public.audit_logs a
    JOIN public.order_items oi ON oi.id = a.entity_id
    JOIN public.products product ON product.id = oi.product_id AND product.product_type = 'product' AND product.requires_booking IS FALSE
    JOIN public.categories category ON category.id = product.category_id AND category.slug = 'retail'
    JOIN public.outlets o ON o.id = oi.outlet_id AND o.vendor_id = p_vendor_id
    JOIN public.orders ord ON ord.id = oi.order_id
    LEFT JOIN public.users customer ON customer.id = ord.user_id
    LEFT JOIN public.users staff ON staff.id = a.actor_id
    WHERE a.action = 'retail_pickup.fulfilled' AND a.entity_type = 'order_item'
      AND a.after_data->>'vendor_id' = p_vendor_id::TEXT AND a.after_data->>'outlet_id' = oi.outlet_id::TEXT
      AND oi.vendor_id = p_vendor_id AND oi.retail_qr_scanned_at IS NOT NULL
      AND oi.outlet_id = ANY(coalesce(p_scope_outlet_ids, ARRAY[]::UUID[]))
      AND (p_outlet_id IS NULL OR oi.outlet_id = p_outlet_id) AND p_kind IN ('all', 'retail_pickup')
  ), filtered AS (
    SELECT r.* FROM records r CROSS JOIN args a
    WHERE a.search_query = '' OR concat_ws(' ', r.item_name, r.item_details, r.item_code, r.customer_name, r.customer_email, r.outlet_name, r.staff_name) ILIKE '%' || a.search_query || '%'
  ), stats AS (
    SELECT count(*)::INTEGER AS total_count,
      count(*) FILTER (WHERE (redeemed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE = (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE)::INTEGER AS today_count,
      count(*) FILTER (WHERE kind = 'voucher')::INTEGER AS voucher_count,
      coalesce(sum(ticket_admissions) FILTER (WHERE kind = 'ticket'), 0)::INTEGER AS ticket_count,
      count(DISTINCT outlet_id)::INTEGER AS active_outlets_count,
      count(*) FILTER (WHERE kind = 'retail_pickup')::INTEGER AS retail_count
    FROM records
  ), page_info AS (
    SELECT s.*, greatest(1, ceil(s.total_count::NUMERIC / a.page_size)::INTEGER) AS total_pages,
      least(a.requested_page, greatest(1, ceil(s.total_count::NUMERIC / a.page_size)::INTEGER)) AS page,
      a.page_size
    FROM stats s CROSS JOIN args a
  )
  SELECT jsonb_build_object(
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'kind', f.kind, 'redeemedAt', f.redeemed_at,
        'outlet', jsonb_build_object('id', f.outlet_id, 'name', f.outlet_name, 'fullName', f.outlet_name, 'location', f.outlet_location),
        'item', jsonb_build_object('code', f.item_code, 'name', f.item_name, 'details', f.item_details, 'discountValue', f.discount_value),
        'customer', jsonb_build_object('name', f.customer_name, 'email', f.customer_email),
        'staff', CASE WHEN f.staff_name IS NULL THEN NULL ELSE jsonb_build_object('name', f.staff_name, 'email', coalesce(f.staff_email, '—')) END
      ) ORDER BY f.redeemed_at DESC, f.id DESC)
      FROM (
        SELECT filtered.* FROM filtered CROSS JOIN page_info
        ORDER BY filtered.redeemed_at DESC, filtered.id DESC
        LIMIT (SELECT page_size FROM page_info)
        OFFSET (SELECT (page - 1) * page_size FROM page_info)
      ) f
    ), '[]'::JSONB),
    'pagination', jsonb_build_object('page', page_info.page, 'pageSize', page_info.page_size, 'total', page_info.total_count, 'totalPages', page_info.total_pages),
    'stats', jsonb_build_object('totalCount', page_info.total_count, 'todayCount', page_info.today_count,
      'voucherCount', page_info.voucher_count, 'ticketCount', page_info.ticket_count,
      'activeOutletsCount', page_info.active_outlets_count, 'retailCount', page_info.retail_count)
  )
  FROM page_info;
$$;

REVOKE ALL ON FUNCTION public.list_vendor_redemption_history(UUID, UUID[], UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_vendor_redemption_history(UUID, UUID[], UUID, TEXT, TEXT, INTEGER, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';

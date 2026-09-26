-- Keep the deployed prepare_checkout implementation (including the online
-- voucher-scope extension) while hardening its trusted price/selection boundary.
DO $migration$
DECLARE
  v_definition TEXT := pg_get_functiondef(
    'public.prepare_checkout(uuid,uuid[],text,text,text,numeric,numeric,numeric,text,jsonb)'::regprocedure
  );
  v_wallet_finalizer TEXT := pg_get_functiondef(
    'public.finalize_customer_wallet_checkout(uuid,text)'::regprocedure
  );
  v_wallet_reserver TEXT := pg_get_functiondef(
    'public.reserve_wallet_split_checkout(uuid)'::regprocedure
  );
  v_wallet_owner_marker TEXT := $old$
  IF v_user IS NOT NULL AND v_session.user_id <> v_user THEN RAISE EXCEPTION 'checkout_not_owned'; END IF;
$old$;
  v_wallet_method_guard TEXT := $new$
  IF v_user IS NOT NULL AND v_session.user_id <> v_user THEN RAISE EXCEPTION 'checkout_not_owned'; END IF;
  IF v_session.payment_method NOT IN ('wallet', 'wallet_split') THEN
    RAISE EXCEPTION 'invalid_wallet_checkout_method';
  END IF;
$new$;
  v_variant_lookup TEXT := $old$
    SELECT * INTO v_variant
      FROM public.product_variants
     WHERE id = v_line.variant_id AND product_id = v_line.product_id AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'variant_not_purchasable'; END IF;
$old$;
  v_variant_guard TEXT := $new$
    v_variant := NULL;
    IF v_line.variant_id IS NOT NULL THEN
      SELECT * INTO v_variant
        FROM public.product_variants
       WHERE id = v_line.variant_id AND product_id = v_line.product_id AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'variant_not_purchasable'; END IF;
      IF v_variant.name IS DISTINCT FROM v_line.variant_name THEN
        RAISE EXCEPTION 'checkout_variant_snapshot_mismatch';
      END IF;
    ELSIF NOT v_product_booking THEN
      RAISE EXCEPTION 'variant_not_purchasable';
    END IF;
$new$;
  v_product_scope TEXT := $old$
     WHERE id = v_line.product_id
       AND vendor_id = v_line.vendor_id
       AND outlet_id = v_line.outlet_id
       AND status = 'active'
       AND review_status = 'approved';
$old$;
  v_product_scope_guard TEXT := $new$
     WHERE id = v_line.product_id
       AND vendor_id = v_line.vendor_id
       AND (
         outlet_id = v_line.outlet_id
         OR (outlet_id IS NULL AND v_line.outlet_id IS NULL)
         OR (outlet_id IS NULL AND v_line.outlet_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.outlet_offers AS offer
            WHERE offer.product_id = products.id
              AND offer.outlet_id = v_line.outlet_id
              AND offer.status = 'active'
         ))
       )
       AND (v_line.outlet_id IS NULL OR EXISTS (
         SELECT 1 FROM public.outlets AS selected_outlet
          WHERE selected_outlet.id = v_line.outlet_id
            AND selected_outlet.vendor_id = v_line.vendor_id
            AND selected_outlet.status = 'active'
       ))
       AND status = 'active'
       AND review_status = 'approved';
$new$;
  v_price_start TEXT := $old$
    IF v_is_free THEN
      v_authoritative_price := v_product.base_price + v_variant.price_offset;
$old$;
  v_price_start_guard TEXT := $new$
    v_authoritative_price := v_product.base_price + COALESCE(v_variant.price_offset, 0);
    IF v_product.outlet_id IS NULL AND v_line.outlet_id IS NOT NULL THEN
      SELECT offer.price + COALESCE(v_variant.price_offset, 0)
        INTO v_authoritative_price
        FROM public.outlet_offers AS offer
       WHERE offer.product_id = v_line.product_id
         AND offer.outlet_id = v_line.outlet_id
         AND offer.status = 'active'
       FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'product_not_purchasable_at_outlet'; END IF;
    END IF;
$new$;
  v_free_price_guard TEXT := $old$
      IF ROUND(v_authoritative_price, 2) <> 0 THEN
        RAISE EXCEPTION 'free_reservation_product_not_free';
      END IF;
$old$;
  v_free_price_check TEXT := $new$
      IF v_is_free AND ROUND(v_authoritative_price, 2) <> 0 THEN
        RAISE EXCEPTION 'free_reservation_product_not_free';
      END IF;
$new$;
  v_price_end TEXT := $old$
      IF ROUND(v_line.unit_price, 2) <> ROUND(v_authoritative_price, 2)
         OR ROUND(v_line.line_total, 2) <> ROUND(v_authoritative_price * v_line.quantity, 2) THEN
        RAISE EXCEPTION 'checkout_line_price_mismatch';
      END IF;
    END IF;

    v_line_sum := v_line_sum + v_line.line_total;
$old$;
  v_price_end_guard TEXT := $new$
      IF v_line.unit_price IS NULL OR v_line.line_total IS NULL
         OR v_line.unit_price < 0
         OR ROUND(v_line.unit_price, 2) <> ROUND(v_authoritative_price, 2)
         OR ROUND(v_line.line_total, 2) <> ROUND(v_authoritative_price * v_line.quantity, 2) THEN
        RAISE EXCEPTION 'checkout_line_price_mismatch';
      END IF;

    v_line_sum := v_line_sum + v_line.line_total;
$new$;
  v_selection_start TEXT := $old$
  IF v_is_free THEN
    SELECT COUNT(DISTINCT x.cart_item_id)
$old$;
  v_selection_start_guard TEXT := $new$
  SELECT COUNT(DISTINCT x.cart_item_id)
$new$;
  v_selection_end TEXT := $old$
    IF v_distinct_line_count <> v_line_count
       OR v_selected_count <> v_line_count
       OR cardinality(p_selected_item_ids) <> v_line_count THEN
      RAISE EXCEPTION 'checkout_selection_mismatch';
    END IF;
  END IF;

  IF ROUND(v_line_sum, 2) <> ROUND(p_subtotal, 2) THEN RAISE EXCEPTION 'checkout_subtotal_mismatch'; END IF;
$old$;
  v_selection_end_guard TEXT := $new$
  IF v_distinct_line_count <> v_line_count
     OR v_selected_count <> v_line_count
     OR cardinality(p_selected_item_ids) <> v_line_count THEN
    RAISE EXCEPTION 'checkout_selection_mismatch';
  END IF;

  IF ROUND(v_line_sum, 2) <> ROUND(p_subtotal, 2) THEN RAISE EXCEPTION 'checkout_subtotal_mismatch'; END IF;
$new$;
  v_name_guard TEXT := $new$
    v_product_booking := v_product.requires_booking;
    IF v_line.product_name IS DISTINCT FROM v_product.name
       OR v_line.image_url IS DISTINCT FROM v_product.cover_url THEN
      RAISE EXCEPTION 'checkout_product_snapshot_mismatch';
    END IF;
$new$;
  v_name_marker TEXT := $old$
    v_product_booking := v_product.requires_booking;
$old$;
  v_slot_marker TEXT := $old$
      IF NOT FOUND THEN RAISE EXCEPTION 'booking_slot_invalid'; END IF;
    END IF;
$old$;
  v_slot_guard TEXT := $new$
      IF NOT FOUND THEN RAISE EXCEPTION 'booking_slot_invalid'; END IF;
      IF v_line.slot_starts_at IS DISTINCT FROM v_slot.starts_at THEN
        RAISE EXCEPTION 'checkout_slot_snapshot_mismatch';
      END IF;
    END IF;
$new$;
BEGIN
  IF position('v_eligible_subtotal NUMERIC := 0;' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'prepare_checkout voucher-scope definition changed; inspect migration before applying';
  END IF;
  IF position('checkout_wallet_reservations' IN v_wallet_finalizer) = 0
     OR position('provider_confirmation_required' IN v_wallet_finalizer) = 0
     OR position('v_reservation.topup_amount_sen + v_reservation.earnings_amount_sen' IN v_wallet_finalizer) = 0 THEN
    RAISE EXCEPTION 'wallet finalizer coverage guard changed; inspect migration before applying';
  END IF;
  IF position('checkout_wallet_reservations' IN v_wallet_reserver) = 0
     OR position('reserve_wallet_split_checkout' IN v_wallet_reserver) = 0
     OR position(v_wallet_owner_marker IN v_wallet_reserver) = 0 THEN
    RAISE EXCEPTION 'wallet reservation function changed; inspect migration before applying';
  END IF;
  IF position(v_variant_lookup IN v_definition) = 0
     OR position(v_product_scope IN v_definition) = 0
     OR position(v_price_start IN v_definition) = 0
     OR position(v_free_price_guard IN v_definition) = 0
     OR position(v_price_end IN v_definition) = 0
     OR position(v_selection_start IN v_definition) = 0
     OR position(v_selection_end IN v_definition) = 0
     OR position(v_name_marker IN v_definition) = 0
     OR position(v_slot_marker IN v_definition) = 0 THEN
    RAISE EXCEPTION 'prepare_checkout price definition changed; inspect migration before applying';
  END IF;

  v_definition := replace(v_definition, v_variant_lookup, v_variant_guard);
  v_definition := replace(v_definition, v_product_scope, v_product_scope_guard);
  v_definition := replace(v_definition, v_name_marker, v_name_guard);
  v_definition := replace(v_definition, v_slot_marker, v_slot_guard);
  v_definition := replace(v_definition, v_price_start, v_price_start_guard);
  v_definition := replace(v_definition, v_free_price_guard, v_free_price_check);
  v_definition := replace(v_definition, v_price_end, v_price_end_guard);
  v_definition := replace(v_definition, v_selection_start, v_selection_start_guard);
  v_definition := replace(v_definition, v_selection_end, v_selection_end_guard);
  v_definition := replace(v_definition,
    'IF v_is_free AND (p_selected_item_ids IS NULL OR cardinality(p_selected_item_ids) = 0) THEN',
    'IF p_selected_item_ids IS NULL OR cardinality(p_selected_item_ids) = 0 THEN');
  v_wallet_reserver := replace(v_wallet_reserver, v_wallet_owner_marker, v_wallet_method_guard);
  EXECUTE v_wallet_reserver;
  EXECUTE v_definition;
END;
$migration$;

-- Remove the RM0 "admission" ticket on Kek Lok Si Temple, and the demo order
-- history behind it.
--
-- See docs/plans/2026-09-10-0211-kl-admission-showcase-and-ticket-ui.md §1.4 B4.
--
-- WHY: places.entry_fee = 0 already tells a visitor the temple is free. The
-- extra RM0 admission product only added a "buy for RM0" card to the place
-- page, and the seeder had given it requires_booking = true plus 39 bookable
-- time slots for a temple you simply walk into. A free place must not carry an
-- admission product (plan D4).
--
-- WHY THE ORDERS GO TOO: order_items.product_id and reviews.product_id are
-- declared with no ON DELETE clause (= NO ACTION), so the product cannot be
-- removed while any of them reference it. Each of the 7 orders involved holds
-- this single RM0 ticket and nothing else, and all 5 payments are amount 0.00 --
-- there is no commercial history worth preserving.
--
-- DELETE ORDER MATTERS. The chain of NO ACTION foreign keys is:
--   reviews.product_id / reviews.order_item_id  -> blocks order_items, products
--   bookings.order_item_id                      -> blocks order_items
--   bookings.slot_id                            -> blocks booking_slots
--   payments.order_id                           -> blocks orders
--   checkout_reservations.slot_id               -> blocks booking_slots
--   cart_items.slot_id                          -> blocks booking_slots
--   order_items.product_id / .slot_id           -> blocks products, booking_slots
-- and booking_slots only disappears when the product does (CASCADE). An earlier
-- draft of this migration omitted checkout_reservations and aborted on
-- checkout_reservations_slot_id_fkey.
--
-- NOT TOUCHED: the temple's two paid add-ons (Inclined Lift to Kuan Yin Statue
-- RM6, Pagoda of Ten Thousand Buddhas RM2) are separate products with their own
-- product_places rows. Afterwards the place shows free entry plus those two.
--
-- Nothing is keyed to a hard-coded UUID, so this runs correctly on any
-- environment, and re-running it is a no-op.

BEGIN;

DO $$
DECLARE
  v_place uuid;
  v_product uuid;
  v_orders uuid[];
  v_admission integer;
  v_addons integer;
  v_fee numeric;
BEGIN
  SELECT id, entry_fee INTO v_place, v_fee FROM places WHERE slug = 'kek-lok-si-temple';
  IF v_place IS NULL THEN
    RAISE EXCEPTION 'kek-lok-si-temple place row is missing';
  END IF;

  SELECT pr.id INTO v_product
    FROM products pr
    JOIN product_places pp ON pp.product_id = pr.id
   WHERE pp.place_id = v_place AND pp.relation_type = 'admission';

  IF v_product IS NULL THEN
    RAISE NOTICE 'Kek Lok Si carries no admission product; nothing to remove.';
  ELSE
    SELECT array_agg(DISTINCT order_id) INTO v_orders
      FROM order_items WHERE product_id = v_product;

    DELETE FROM reviews
     WHERE product_id = v_product
        OR order_item_id IN (SELECT id FROM order_items WHERE product_id = v_product);

    DELETE FROM bookings
     WHERE order_item_id IN (SELECT id FROM order_items WHERE product_id = v_product)
        OR slot_id IN (SELECT id FROM booking_slots WHERE product_id = v_product);

    -- Hold the slots open no longer. Cascades to checkout_reservations,
    -- checkout_wallet_reservations and voucher_holds; payment_events keeps its
    -- row with checkout_session_id set to NULL.
    DELETE FROM checkout_sessions
     WHERE id IN (
             SELECT checkout_session_id FROM checkout_reservations
              WHERE slot_id IN (SELECT id FROM booking_slots WHERE product_id = v_product));

    -- Defensive: another environment's demo data may hold slot references from
    -- sessions or carts unrelated to these orders. Both are zero here.
    DELETE FROM checkout_reservations
     WHERE slot_id IN (SELECT id FROM booking_slots WHERE product_id = v_product);
    DELETE FROM cart_items
     WHERE slot_id IN (SELECT id FROM booking_slots WHERE product_id = v_product);

    IF v_orders IS NOT NULL THEN
      DELETE FROM payments WHERE order_id = ANY (v_orders);
      DELETE FROM checkout_sessions WHERE order_id = ANY (v_orders);
      -- Cascades to order_items, which cascades to ticket_passes.
      DELETE FROM orders WHERE id = ANY (v_orders);
    END IF;

    -- Cascades to booking_slots, product_variants, customer_wishlists,
    -- product_places.
    DELETE FROM products WHERE id = v_product;
  END IF;

  SELECT count(*) INTO v_admission
    FROM product_places WHERE place_id = v_place AND relation_type = 'admission';
  IF v_admission <> 0 THEN
    RAISE EXCEPTION 'expected 0 admission products on Kek Lok Si, found %', v_admission;
  END IF;

  SELECT count(*) INTO v_addons
    FROM product_places WHERE place_id = v_place AND relation_type = 'addon';
  IF v_addons <> 2 THEN
    RAISE EXCEPTION 'expected the 2 Kek Lok Si add-ons to survive, found %', v_addons;
  END IF;

  IF v_fee IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'expected Kek Lok Si entry_fee to stay 0, found %', v_fee;
  END IF;
END $$;

COMMIT;

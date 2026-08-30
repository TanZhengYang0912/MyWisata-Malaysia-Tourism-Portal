-- Additive commerce/vendor hardening. Existing tables and records are preserved.

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS per_customer_limit INTEGER,
  ADD COLUMN IF NOT EXISTS reserved_uses INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.vouchers
  DROP CONSTRAINT IF EXISTS vouchers_per_customer_limit_check;
ALTER TABLE public.vouchers
  ADD CONSTRAINT vouchers_per_customer_limit_check
  CHECK (per_customer_limit IS NULL OR per_customer_limit > 0);

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN ('product','activity','experience','food','digital','service'));

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider VARCHAR(40) NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending','requires_action','succeeded','failed','cancelled','refunded','partially_refunded'));

CREATE TABLE IF NOT EXISTS public.checkout_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cart_id            UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  order_id           UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  payment_method     VARCHAR(30) NOT NULL,
  idempotency_key    VARCHAR(255) NOT NULL,
  request_hash       VARCHAR(128) NOT NULL,
  subtotal           NUMERIC(12,2) NOT NULL,
  discount_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount       NUMERIC(12,2) NOT NULL,
  currency           VARCHAR(3) NOT NULL DEFAULT 'MYR',
  status             VARCHAR(30) NOT NULL DEFAULT 'pending_payment'
                       CHECK (status IN ('pending_payment','requires_action','paid','failed','expired','cancelled')),
  expires_at         TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.checkout_reservations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id UUID NOT NULL REFERENCES public.checkout_sessions(id) ON DELETE CASCADE,
  kind                VARCHAR(20) NOT NULL CHECK (kind IN ('inventory','booking')),
  variant_id          UUID REFERENCES public.product_variants(id),
  slot_id             UUID REFERENCES public.booking_slots(id),
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  status              VARCHAR(20) NOT NULL DEFAULT 'held'
                        CHECK (status IN ('held','committed','released')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((kind = 'inventory' AND variant_id IS NOT NULL AND slot_id IS NULL)
      OR (kind = 'booking' AND slot_id IS NOT NULL AND variant_id IS NULL))
);

CREATE TABLE IF NOT EXISTS public.voucher_holds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id          UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  checkout_session_id UUID NOT NULL UNIQUE REFERENCES public.checkout_sessions(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status              VARCHAR(20) NOT NULL DEFAULT 'held'
                        CHECK (status IN ('held','committed','released')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider             VARCHAR(40) NOT NULL,
  provider_event_id   VARCHAR(255) NOT NULL,
  checkout_session_id UUID REFERENCES public.checkout_sessions(id) ON DELETE SET NULL,
  order_id            UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  event_type          VARCHAR(120) NOT NULL,
  payload_hash        VARCHAR(128),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS public.vendor_onboarding_profiles (
  vendor_id             UUID PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  legal_business_name   VARCHAR(255),
  registration_number   VARCHAR(120),
  contact_name          VARCHAR(255),
  contact_email         VARCHAR(255),
  contact_phone         VARCHAR(50),
  business_address      TEXT,
  status                VARCHAR(30) NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','submitted','in_review','needs_information','approved','rejected')),
  review_note           TEXT,
  reviewed_by           UUID REFERENCES public.users(id),
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vendor_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  document_type  VARCHAR(60) NOT NULL,
  storage_path   TEXT NOT NULL,
  original_name  VARCHAR(255),
  mime_type      VARCHAR(120),
  file_size      INTEGER,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected')),
  review_note    TEXT,
  uploaded_by    UUID NOT NULL REFERENCES public.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vendor_recommendation_invites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES public.vendor_recommendations(id) ON DELETE CASCADE,
  email             VARCHAR(255),
  token_hash        VARCHAR(128) NOT NULL UNIQUE,
  status            VARCHAR(20) NOT NULL DEFAULT 'invited'
                      CHECK (status IN ('invited','claimed','expired','cancelled')),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  claimed_vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.voucher_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id  UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type  VARCHAR(30) NOT NULL CHECK (event_type IN ('viewed','entered','apply_success','apply_failed','redeemed','expired')),
  order_id    UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user_status
  ON public.checkout_sessions(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkout_reservations_session_status
  ON public.checkout_reservations(checkout_session_id, status);
CREATE INDEX IF NOT EXISTS idx_voucher_holds_voucher_user
  ON public.voucher_holds(voucher_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_events_order
  ON public.payment_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor
  ON public.vendor_documents(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voucher_events_voucher_type
  ON public.voucher_events(voucher_id, event_type, created_at DESC);

ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_onboarding_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_recommendation_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checkout_sessions_own_select ON public.checkout_sessions;
CREATE POLICY checkout_sessions_own_select ON public.checkout_sessions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS vendor_onboarding_owner_select ON public.vendor_onboarding_profiles;
CREATE POLICY vendor_onboarding_owner_select ON public.vendor_onboarding_profiles
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = (SELECT auth.uid()))
    OR is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS vendor_documents_owner_select ON public.vendor_documents;
CREATE POLICY vendor_documents_owner_select ON public.vendor_documents
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = (SELECT auth.uid()))
    OR is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS voucher_events_vendor_or_admin_select ON public.voucher_events;
CREATE POLICY voucher_events_vendor_or_admin_select ON public.voucher_events
  FOR SELECT TO authenticated USING (
    user_id = (SELECT auth.uid())
    OR is_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.vouchers v
      JOIN public.user_roles ur ON ur.vendor_id = v.vendor_id
      JOIN public.roles r ON r.id = ur.role_id
      WHERE v.id = voucher_id AND ur.user_id = (SELECT auth.uid()) AND r.name IN ('vendor_owner','outlet_manager')
    )
  );

CREATE OR REPLACE FUNCTION public.validate_product_outlet_vendor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE outlet_vendor UUID;
BEGIN
  SELECT vendor_id INTO outlet_vendor FROM public.outlets WHERE id = NEW.outlet_id;
  IF outlet_vendor IS NULL OR outlet_vendor <> NEW.vendor_id THEN
    RAISE EXCEPTION 'product_outlet_vendor_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_product_outlet_vendor ON public.products;
CREATE TRIGGER trg_validate_product_outlet_vendor
  BEFORE INSERT OR UPDATE OF vendor_id, outlet_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_outlet_vendor();

CREATE OR REPLACE FUNCTION public.validate_booking_slot_outlet_product()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE product_outlet UUID;
BEGIN
  SELECT outlet_id INTO product_outlet FROM public.products WHERE id = NEW.product_id;
  IF product_outlet IS NULL OR product_outlet <> NEW.outlet_id THEN
    RAISE EXCEPTION 'booking_slot_product_outlet_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_booking_slot_outlet_product ON public.booking_slots;
CREATE TRIGGER trg_validate_booking_slot_outlet_product
  BEFORE INSERT OR UPDATE OF product_id, outlet_id ON public.booking_slots
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_slot_outlet_product();

CREATE OR REPLACE FUNCTION public.validate_voucher_targets()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE product_vendor UUID; outlet_vendor UUID;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT vendor_id INTO product_vendor FROM public.products WHERE id = NEW.product_id;
    IF product_vendor IS NULL OR product_vendor <> NEW.vendor_id THEN
      RAISE EXCEPTION 'voucher_product_vendor_mismatch';
    END IF;
  END IF;
  IF NEW.outlet_id IS NOT NULL THEN
    SELECT vendor_id INTO outlet_vendor FROM public.outlets WHERE id = NEW.outlet_id;
    IF outlet_vendor IS NULL OR outlet_vendor <> NEW.vendor_id THEN
      RAISE EXCEPTION 'voucher_outlet_vendor_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_voucher_targets ON public.vouchers;
CREATE TRIGGER trg_validate_voucher_targets
  BEFORE INSERT OR UPDATE OF vendor_id, outlet_id, product_id ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.validate_voucher_targets();

CREATE OR REPLACE FUNCTION public.prepare_checkout(
  p_cart_id UUID,
  p_selected_item_ids UUID[],
  p_idempotency_key TEXT,
  p_request_hash TEXT,
  p_payment_method TEXT,
  p_subtotal NUMERIC,
  p_discount NUMERIC,
  p_total NUMERIC,
  p_voucher_code TEXT,
  p_lines JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_session checkout_sessions%ROWTYPE;
  v_order_id UUID;
  v_payment_id UUID;
  v_cart_user UUID;
  v_line RECORD;
  v_order_item_id UUID;
  v_updated INTEGER;
  v_product_booking BOOLEAN;
  v_voucher vouchers%ROWTYPE;
  v_existing_redemptions INTEGER;
  v_existing_holds INTEGER;
  v_line_sum NUMERIC := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'checkout_auth_required'; END IF;
  SELECT user_id INTO v_cart_user FROM public.carts WHERE id = p_cart_id;
  IF v_cart_user IS NULL OR v_cart_user <> v_user THEN RAISE EXCEPTION 'cart_not_owned'; END IF;

  SELECT * INTO v_session
    FROM public.checkout_sessions
   WHERE user_id = v_user AND idempotency_key = p_idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_session.request_hash <> p_request_hash THEN RAISE EXCEPTION 'idempotency_key_reused'; END IF;
    RETURN jsonb_build_object('checkout_session_id', v_session.id, 'order_id', v_session.order_id, 'status', v_session.status);
  END IF;

  IF p_payment_method NOT IN ('mock_card','stripe_card','ewallet','bank_transfer','wallet') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;
  IF p_total < 0 OR p_discount < 0 OR p_subtotal < 0 OR p_total <> ROUND(p_subtotal - p_discount, 2) THEN
    RAISE EXCEPTION 'invalid_checkout_totals';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    cart_item_id UUID, product_id UUID, variant_id UUID, slot_id UUID, vendor_id UUID, outlet_id UUID,
    product_name TEXT, image_url TEXT, variant_name TEXT, slot_starts_at TIMESTAMPTZ,
    unit_price NUMERIC, quantity INTEGER, line_total NUMERIC, requires_booking BOOLEAN
  ) LOOP
    IF p_selected_item_ids IS NOT NULL AND NOT (v_line.cart_item_id = ANY(p_selected_item_ids)) THEN
      RAISE EXCEPTION 'checkout_line_not_selected';
    END IF;
    IF v_line.quantity IS NULL OR v_line.quantity < 1 THEN RAISE EXCEPTION 'invalid_line_quantity'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cart_items ci WHERE ci.id = v_line.cart_item_id AND ci.cart_id = p_cart_id) THEN
      RAISE EXCEPTION 'cart_line_not_found';
    END IF;
    SELECT requires_booking INTO v_product_booking
      FROM public.products WHERE id = v_line.product_id AND vendor_id = v_line.vendor_id AND outlet_id = v_line.outlet_id
        AND status = 'active' AND review_status = 'approved';
    IF NOT FOUND OR v_product_booking <> COALESCE(v_line.requires_booking, false) THEN RAISE EXCEPTION 'product_not_purchasable'; END IF;
    IF v_line.variant_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id = v_line.variant_id AND product_id = v_line.product_id AND is_active) THEN
      RAISE EXCEPTION 'variant_not_purchasable';
    END IF;
    IF v_product_booking THEN
      IF v_line.slot_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.booking_slots WHERE id = v_line.slot_id AND product_id = v_line.product_id AND outlet_id = v_line.outlet_id) THEN
        RAISE EXCEPTION 'booking_slot_invalid';
      END IF;
    END IF;
    v_line_sum := v_line_sum + v_line.line_total;
  END LOOP;
  IF ROUND(v_line_sum, 2) <> ROUND(p_subtotal, 2) THEN RAISE EXCEPTION 'checkout_subtotal_mismatch'; END IF;

  IF p_voucher_code IS NOT NULL AND length(trim(p_voucher_code)) > 0 THEN
    SELECT * INTO v_voucher FROM public.vouchers WHERE upper(code) = upper(trim(p_voucher_code)) AND is_active AND review_status = 'approved' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'voucher_not_available'; END IF;
    IF v_voucher.valid_from IS NOT NULL AND v_voucher.valid_from > NOW() THEN RAISE EXCEPTION 'voucher_not_started'; END IF;
    IF v_voucher.valid_until IS NOT NULL AND v_voucher.valid_until < NOW() THEN RAISE EXCEPTION 'voucher_expired'; END IF;
    IF v_voucher.max_uses IS NOT NULL AND v_voucher.uses_count + v_voucher.reserved_uses >= v_voucher.max_uses THEN RAISE EXCEPTION 'voucher_limit_reached'; END IF;
    IF p_subtotal < COALESCE(v_voucher.min_spend, 0) THEN RAISE EXCEPTION 'voucher_minimum_spend'; END IF;
    SELECT count(*) INTO v_existing_redemptions FROM public.voucher_redemptions WHERE voucher_id = v_voucher.id AND user_id = v_user;
    SELECT count(*) INTO v_existing_holds FROM public.voucher_holds WHERE voucher_id = v_voucher.id AND user_id = v_user AND status = 'held';
    IF v_voucher.per_customer_limit IS NOT NULL AND v_existing_redemptions + v_existing_holds >= v_voucher.per_customer_limit THEN RAISE EXCEPTION 'voucher_customer_limit_reached'; END IF;
  END IF;

  INSERT INTO public.orders(user_id, status, subtotal, discount_amount, total_amount, payment_method, voucher_code)
  VALUES (v_user, 'pending_payment', p_subtotal, p_discount, p_total, p_payment_method, NULLIF(trim(p_voucher_code), ''))
  RETURNING id INTO v_order_id;

  INSERT INTO public.payments(order_id, method, provider, amount, status, idempotency_key)
  VALUES (v_order_id, p_payment_method, CASE WHEN p_payment_method = 'stripe_card' THEN 'stripe' ELSE 'platform' END, p_total, 'pending', p_idempotency_key)
  RETURNING id INTO v_payment_id;

  INSERT INTO public.checkout_sessions(user_id, cart_id, order_id, payment_method, idempotency_key, request_hash, subtotal, discount_amount, total_amount)
  VALUES (v_user, p_cart_id, v_order_id, p_payment_method, p_idempotency_key, p_request_hash, p_subtotal, p_discount, p_total)
  RETURNING * INTO v_session;

  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    cart_item_id UUID, product_id UUID, variant_id UUID, slot_id UUID, vendor_id UUID, outlet_id UUID,
    product_name TEXT, image_url TEXT, variant_name TEXT, slot_starts_at TIMESTAMPTZ,
    unit_price NUMERIC, quantity INTEGER, line_total NUMERIC, requires_booking BOOLEAN
  ) LOOP
    INSERT INTO public.order_items(order_id, vendor_id, outlet_id, product_id, variant_id, slot_id, product_name, image_url, variant_name, slot_starts_at, unit_price, quantity, line_total, fulfil_status)
    VALUES (v_order_id, v_line.vendor_id, v_line.outlet_id, v_line.product_id, v_line.variant_id, v_line.slot_id, v_line.product_name, v_line.image_url, v_line.variant_name, v_line.slot_starts_at, v_line.unit_price, v_line.quantity, v_line.line_total, 'pending')
    RETURNING id INTO v_order_item_id;

    IF COALESCE(v_line.requires_booking, false) THEN
      UPDATE public.booking_slots
         SET booked = booked + v_line.quantity,
             status = CASE WHEN booked + v_line.quantity >= capacity THEN 'full' ELSE status END
       WHERE id = v_line.slot_id AND status = 'available' AND booked + v_line.quantity <= capacity;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated <> 1 THEN RAISE EXCEPTION 'booking_capacity_unavailable'; END IF;
      INSERT INTO public.checkout_reservations(checkout_session_id, kind, slot_id, quantity)
      VALUES (v_session.id, 'booking', v_line.slot_id, v_line.quantity);
      INSERT INTO public.bookings(order_item_id, slot_id, customer_id, demo_qr_code)
      VALUES (v_order_item_id, v_line.slot_id, v_user, 'MY-' || upper(right(replace(v_order_id::text, '-', ''), 10)));
    ELSE
      UPDATE public.inventory
         SET reserved = reserved + v_line.quantity, updated_at = NOW()
       WHERE variant_id = v_line.variant_id AND quantity - reserved >= v_line.quantity;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated <> 1 THEN RAISE EXCEPTION 'inventory_unavailable'; END IF;
      INSERT INTO public.checkout_reservations(checkout_session_id, kind, variant_id, quantity)
      VALUES (v_session.id, 'inventory', v_line.variant_id, v_line.quantity);
    END IF;
  END LOOP;

  IF v_voucher.id IS NOT NULL THEN
    UPDATE public.vouchers SET reserved_uses = reserved_uses + 1 WHERE id = v_voucher.id;
    INSERT INTO public.voucher_holds(voucher_id, checkout_session_id, user_id) VALUES (v_voucher.id, v_session.id, v_user);
  END IF;
  RETURN jsonb_build_object('checkout_session_id', v_session.id, 'order_id', v_order_id, 'payment_id', v_payment_id, 'status', v_session.status, 'expires_at', v_session.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_checkout(
  p_checkout_session_id UUID,
  p_outcome TEXT,
  p_provider_payment_id TEXT DEFAULT NULL,
  p_provider_event_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_session checkout_sessions%ROWTYPE;
  v_reservation RECORD;
  v_hold voucher_holds%ROWTYPE;
  v_payment_id UUID;
BEGIN
  IF v_user IS NULL AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN RAISE EXCEPTION 'checkout_auth_required'; END IF;
  SELECT * INTO v_session FROM public.checkout_sessions WHERE id = p_checkout_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_session_not_found'; END IF;
  IF v_user IS NOT NULL AND v_user <> v_session.user_id AND NOT is_admin(v_user) THEN RAISE EXCEPTION 'checkout_not_owned'; END IF;
  IF v_session.status = 'paid' THEN RETURN jsonb_build_object('checkout_session_id', v_session.id, 'order_id', v_session.order_id, 'status', 'paid'); END IF;
  IF v_session.status IN ('failed','expired','cancelled') THEN RETURN jsonb_build_object('checkout_session_id', v_session.id, 'order_id', v_session.order_id, 'status', v_session.status); END IF;

  SELECT id INTO v_payment_id FROM public.payments WHERE order_id = v_session.order_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF lower(p_outcome) IN ('failed','cancelled','expired') THEN
    FOR v_reservation IN SELECT * FROM public.checkout_reservations WHERE checkout_session_id = v_session.id AND status = 'held' LOOP
      IF v_reservation.kind = 'inventory' THEN
        UPDATE public.inventory SET reserved = GREATEST(0, reserved - v_reservation.quantity), updated_at = NOW() WHERE variant_id = v_reservation.variant_id;
      ELSE
        UPDATE public.booking_slots SET booked = GREATEST(0, booked - v_reservation.quantity), status = CASE WHEN status = 'full' AND booked - v_reservation.quantity < capacity THEN 'available' ELSE status END WHERE id = v_reservation.slot_id;
        UPDATE public.bookings SET status = 'cancelled', cancelled_at = NOW() WHERE order_item_id IN (SELECT id FROM public.order_items WHERE order_id = v_session.order_id AND slot_id = v_reservation.slot_id);
      END IF;
      UPDATE public.checkout_reservations SET status = 'released' WHERE id = v_reservation.id;
    END LOOP;
    SELECT * INTO v_hold FROM public.voucher_holds WHERE checkout_session_id = v_session.id AND status = 'held' FOR UPDATE;
    IF v_hold.id IS NOT NULL THEN
      UPDATE public.vouchers SET reserved_uses = GREATEST(0, reserved_uses - 1) WHERE id = v_hold.voucher_id;
      UPDATE public.voucher_holds SET status = 'released' WHERE id = v_hold.id;
    END IF;
    UPDATE public.payments SET status = CASE WHEN lower(p_outcome) = 'expired' THEN 'cancelled' ELSE 'failed' END, failure_reason = p_outcome, updated_at = NOW() WHERE id = v_payment_id;
    UPDATE public.orders SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = v_session.order_id;
    UPDATE public.checkout_sessions SET status = CASE WHEN lower(p_outcome) = 'expired' THEN 'expired' ELSE 'failed' END, updated_at = NOW() WHERE id = v_session.id;
    RETURN jsonb_build_object('checkout_session_id', v_session.id, 'order_id', v_session.order_id, 'status', 'failed');
  END IF;

  FOR v_reservation IN SELECT * FROM public.checkout_reservations WHERE checkout_session_id = v_session.id AND status = 'held' LOOP
    IF v_reservation.kind = 'inventory' THEN
      UPDATE public.inventory SET quantity = quantity - v_reservation.quantity, reserved = GREATEST(0, reserved - v_reservation.quantity), updated_at = NOW() WHERE variant_id = v_reservation.variant_id AND quantity >= v_reservation.quantity AND reserved >= v_reservation.quantity;
      IF NOT FOUND THEN RAISE EXCEPTION 'inventory_commit_failed'; END IF;
    END IF;
    UPDATE public.checkout_reservations SET status = 'committed' WHERE id = v_reservation.id;
  END LOOP;

  SELECT * INTO v_hold FROM public.voucher_holds WHERE checkout_session_id = v_session.id AND status = 'held' FOR UPDATE;
  IF v_hold.id IS NOT NULL THEN
    UPDATE public.vouchers SET reserved_uses = GREATEST(0, reserved_uses - 1), uses_count = uses_count + 1 WHERE id = v_hold.voucher_id;
    INSERT INTO public.voucher_redemptions(voucher_id, order_id, user_id, discount)
    SELECT v_hold.voucher_id, v_session.order_id, v_hold.user_id, discount_amount FROM public.orders WHERE id = v_session.order_id
    ON CONFLICT (voucher_id, order_id) DO NOTHING;
    UPDATE public.voucher_holds SET status = 'committed' WHERE id = v_hold.id;
  END IF;
  UPDATE public.payments SET status = 'succeeded', provider_payment_id = COALESCE(p_provider_payment_id, provider_payment_id), processed_at = NOW(), updated_at = NOW() WHERE id = v_payment_id;
  UPDATE public.orders SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = v_session.order_id;
  UPDATE public.checkout_sessions SET status = 'paid', updated_at = NOW() WHERE id = v_session.id;
  UPDATE public.cart_items SET quantity = quantity WHERE cart_id = v_session.cart_id AND id IN (SELECT ci.id FROM public.cart_items ci JOIN public.order_items oi ON oi.variant_id = ci.variant_id AND oi.slot_id IS NOT DISTINCT FROM ci.slot_id WHERE oi.order_id = v_session.order_id);
  DELETE FROM public.cart_items ci WHERE ci.cart_id = v_session.cart_id AND ci.id IN (SELECT ci2.id FROM public.cart_items ci2 WHERE ci2.cart_id = v_session.cart_id AND EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = v_session.order_id AND oi.variant_id = ci2.variant_id AND oi.slot_id IS NOT DISTINCT FROM ci2.slot_id));
  IF p_provider_event_id IS NOT NULL THEN
    INSERT INTO public.payment_events(provider, provider_event_id, checkout_session_id, order_id, event_type)
    VALUES ('stripe', p_provider_event_id, v_session.id, v_session.order_id, 'checkout.finalized')
    ON CONFLICT (provider, provider_event_id) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('checkout_session_id', v_session.id, 'order_id', v_session.order_id, 'status', 'paid');
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_checkout(UUID, UUID[], TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_checkout(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_checkout(UUID, UUID[], TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_checkout(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
;

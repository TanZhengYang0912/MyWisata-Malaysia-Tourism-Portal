-- Event promotion Stripe Checkout safety
-- (docs/plans/2026-11-14-1530-event-promotion-checkout-refund-safety.md).
--
-- 1. Track the one open Checkout session per promotion and the amount it was
--    created for, so the app can expire it before a wallet payment, a new
--    Checkout, or a resubmit.
-- 2. confirm_vendor_event_promotion_stripe_payment reports WHY a paid session
--    cannot be posted instead of raising. The webhook refunds those payments
--    and answers 200, so Stripe stops retrying and the vendor is not charged
--    for nothing.
--
-- Apply only after confirming the target is the local test database; then
-- deploy the app build that reads the TEXT outcome. Existing rows are not
-- rewritten: both new columns are nullable and start empty.
-- Rollback: deploy the previous app build, then re-create the RETURNS VOID
-- function from 20260928030000_vendor_event_promotions.sql (DROP FUNCTION
-- first, since the return type differs). The new columns can stay.

ALTER TABLE public.vendor_event_promotions
  ADD COLUMN IF NOT EXISTS pending_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS pending_checkout_amount_sen BIGINT;

ALTER TABLE public.vendor_event_promotions
  DROP CONSTRAINT IF EXISTS vendor_event_promotions_pending_checkout_amount_check;
ALTER TABLE public.vendor_event_promotions
  ADD CONSTRAINT vendor_event_promotions_pending_checkout_amount_check
  CHECK (pending_checkout_amount_sen IS NULL OR pending_checkout_amount_sen > 0);

COMMENT ON COLUMN public.vendor_event_promotions.pending_checkout_session_id IS
  'Open Stripe Checkout session for this promotion fee. Only this session may mark the promotion paid; any other paid session is refunded.';

-- The return type changes from VOID to TEXT, which CREATE OR REPLACE cannot do.
DROP FUNCTION IF EXISTS public.confirm_vendor_event_promotion_stripe_payment(UUID, TEXT, BIGINT);

CREATE FUNCTION public.confirm_vendor_event_promotion_stripe_payment(
  p_promotion_id UUID,
  p_checkout_session_id TEXT,
  p_amount_sen BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_submitted_by UUID;
  v_confirmed_session TEXT;
  v_pending_session TEXT;
  v_pending_amount BIGINT;
  v_starts_on DATE;
  v_ends_on DATE;
  v_cost_per_day_sen BIGINT;
  v_expected_amount BIGINT;
BEGIN
  SELECT status, submitted_by, stripe_checkout_session_id, pending_checkout_session_id,
         pending_checkout_amount_sen, starts_on, ends_on
    INTO v_status, v_submitted_by, v_confirmed_session, v_pending_session,
         v_pending_amount, v_starts_on, v_ends_on
    FROM public.vendor_event_promotions
   WHERE id = p_promotion_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  -- Duplicate delivery of the session that already paid: nothing to do.
  IF v_status = 'paid' AND v_confirmed_session = p_checkout_session_id THEN RETURN 'already_confirmed'; END IF;
  -- Paid another way (wallet, or a different session): this charge must be refunded.
  IF v_status = 'paid' THEN RETURN 'already_paid'; END IF;
  IF v_status <> 'approved' THEN RETURN 'not_payable'; END IF;

  IF v_pending_session IS NOT NULL THEN
    -- A newer Checkout replaced this one; the old price may no longer apply.
    IF v_pending_session <> p_checkout_session_id THEN RETURN 'superseded'; END IF;
    v_expected_amount := v_pending_amount;
  ELSE
    -- Sessions created before this migration were not recorded: accept them
    -- only for exactly the fee the promotion costs now.
    SELECT COALESCE(value::BIGINT, 10000) INTO v_cost_per_day_sen
      FROM public.platform_settings WHERE key = 'event_promotion.cost_per_day_sen';
    v_expected_amount := ((v_ends_on - v_starts_on) + 1) * COALESCE(v_cost_per_day_sen, 10000);
  END IF;
  IF v_expected_amount IS DISTINCT FROM p_amount_sen THEN RETURN 'amount_mismatch'; END IF;

  UPDATE public.vendor_event_promotions
     SET status = 'paid',
         amount_sen = p_amount_sen,
         payment_method = 'stripe',
         stripe_checkout_session_id = p_checkout_session_id,
         pending_checkout_session_id = NULL,
         pending_checkout_amount_sen = NULL,
         paid_at = now(),
         updated_at = now()
   WHERE id = p_promotion_id;

  INSERT INTO public.vendor_event_promotion_review_events
    (promotion_id, from_status, to_status, action, actor_id, actor_role, note)
  VALUES
    (p_promotion_id, 'approved', 'paid', 'pay', v_submitted_by, 'vendor', 'Paid via Stripe checkout');

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    v_submitted_by, 'event_promotion.paid', 'vendor_event_promotion', p_promotion_id,
    jsonb_build_object('status', 'approved'),
    jsonb_build_object('status', 'paid', 'amount_sen', p_amount_sen, 'payment_method', 'stripe', 'checkout_session_id', p_checkout_session_id),
    'Vendor paid event promotion fee via Stripe checkout'
  );
  RETURN 'confirmed';
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_vendor_event_promotion_stripe_payment(UUID, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_vendor_event_promotion_stripe_payment(UUID, TEXT, BIGINT) TO service_role;

-- One audit row per refunded Checkout session, however often the webhook retries.
CREATE OR REPLACE FUNCTION public.record_vendor_event_promotion_stripe_refund(
  p_promotion_id UUID,
  p_checkout_session_id TEXT,
  p_provider_refund_id TEXT,
  p_amount_sen BIGINT,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_submitted_by UUID;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.audit_logs
     WHERE action = 'event_promotion.stripe_refunded'
       AND entity_id = p_promotion_id
       AND after_data->>'checkout_session_id' = p_checkout_session_id
  ) THEN
    RETURN;
  END IF;

  SELECT submitted_by INTO v_submitted_by
    FROM public.vendor_event_promotions WHERE id = p_promotion_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    v_submitted_by, 'event_promotion.stripe_refunded', 'vendor_event_promotion', p_promotion_id,
    NULL,
    jsonb_build_object(
      'checkout_session_id', p_checkout_session_id,
      'provider_refund_id', p_provider_refund_id,
      'amount_sen', p_amount_sen,
      'reason', p_reason
    ),
    'Stripe payment could not be applied to the promotion and was refunded in full'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_vendor_event_promotion_stripe_refund(UUID, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_vendor_event_promotion_stripe_refund(UUID, TEXT, TEXT, BIGINT, TEXT) TO service_role;

-- Stripe settles refunds asynchronously. Record each refund status once and,
-- when Stripe reports failed or canceled, alert Super Admins in-app: the
-- vendor was charged and the automatic refund did not reach them.
CREATE OR REPLACE FUNCTION public.record_vendor_event_promotion_refund_outcome(
  p_promotion_id UUID,
  p_checkout_session_id TEXT,
  p_provider_refund_id TEXT,
  p_status TEXT,
  p_failure_reason TEXT,
  p_amount_sen BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_submitted_by UUID;
  v_title TEXT;
BEGIN
  IF p_status NOT IN ('pending', 'requires_action', 'succeeded', 'failed', 'canceled') THEN
    RAISE EXCEPTION 'invalid_refund_status';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.audit_logs
     WHERE action = 'event_promotion.stripe_refund_status'
       AND entity_id = p_promotion_id
       AND after_data->>'provider_refund_id' = p_provider_refund_id
       AND after_data->>'status' = p_status
  ) THEN
    RETURN;
  END IF;

  SELECT submitted_by, title INTO v_submitted_by, v_title
    FROM public.vendor_event_promotions WHERE id = p_promotion_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    v_submitted_by, 'event_promotion.stripe_refund_status', 'vendor_event_promotion', p_promotion_id,
    NULL,
    jsonb_build_object(
      'checkout_session_id', p_checkout_session_id,
      'provider_refund_id', p_provider_refund_id,
      'status', p_status,
      'failure_reason', p_failure_reason,
      'amount_sen', p_amount_sen
    ),
    'Stripe refund status for an event promotion payment that could not be applied'
  );

  IF p_status IN ('failed', 'canceled') THEN
    INSERT INTO public.notifications(user_id, type, title, body, link, category, event_key, metadata)
    SELECT users.id,
           'event_promotion_refund_failed',
           'Event promotion refund failed',
           'An automatic refund for "' || COALESCE(v_title, 'an event promotion') || '" did not complete. Refund the vendor manually in Stripe.',
           '/admin/event-promotions',
           'wallet',
           'event_promotion_refund_failed:' || p_provider_refund_id || ':' || users.id::TEXT,
           jsonb_build_object('promotion_id', p_promotion_id, 'provider_refund_id', p_provider_refund_id, 'checkout_session_id', p_checkout_session_id)
      FROM public.users
     WHERE users.status = 'active' AND public.is_super_admin(users.id)
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_vendor_event_promotion_refund_outcome(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_vendor_event_promotion_refund_outcome(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT) TO service_role;

NOTIFY pgrst, 'reload schema';

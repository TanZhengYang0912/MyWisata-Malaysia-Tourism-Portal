-- Recommendation evidence, private contact review, and financial-outcome reversals.
-- This migration is additive: legacy recommendations remain readable, while all new
-- submissions use submit_recommendation_with_evidence.

ALTER TABLE public.vendor_recommendations
  ADD COLUMN IF NOT EXISTS why_recommend TEXT,
  ADD COLUMN IF NOT EXISTS google_place_id TEXT,
  ADD COLUMN IF NOT EXISTS location_name TEXT,
  ADD COLUMN IF NOT EXISTS formatted_address TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_website TEXT,
  ADD COLUMN IF NOT EXISTS image_attested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS changes_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS changes_requested_reason TEXT;

ALTER TABLE public.vendor_recommendations
  DROP CONSTRAINT IF EXISTS vendor_recommendations_status_check;
ALTER TABLE public.vendor_recommendations
  ADD CONSTRAINT vendor_recommendations_status_check
  CHECK (status IN ('pending', 'changes_requested', 'approved', 'rejected', 'converted'));

CREATE TABLE IF NOT EXISTS public.recommendation_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES public.vendor_recommendations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.users(id),
  storage_path TEXT NOT NULL UNIQUE,
  sort_order SMALLINT NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 4),
  is_staged BOOLEAN NOT NULL DEFAULT true,
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((is_staged AND recommendation_id IS NULL) OR (NOT is_staged AND recommendation_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS recommendation_images_one_active_position
  ON public.recommendation_images(recommendation_id, sort_order)
  WHERE removed_at IS NULL AND NOT is_staged;

ALTER TABLE public.recommendation_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recommendation_images_owner_read ON public.recommendation_images;
CREATE POLICY recommendation_images_owner_read ON public.recommendation_images
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS recommendation_images_admin_read ON public.recommendation_images;
CREATE POLICY recommendation_images_admin_read ON public.recommendation_images
  FOR SELECT USING (public.is_admin(auth.uid()));

INSERT INTO storage.buckets (id, name, public)
VALUES ('recommendation-images', 'recommendation-images', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS recommendation_images_storage_owner_insert ON storage.objects;
CREATE POLICY recommendation_images_storage_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recommendation-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS recommendation_images_storage_owner_select ON storage.objects;
CREATE POLICY recommendation_images_storage_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'recommendation-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE OR REPLACE FUNCTION public.submit_recommendation_with_evidence(
  p_vendor_name TEXT,
  p_description TEXT,
  p_why_recommend TEXT,
  p_category_id UUID,
  p_google_place_id TEXT,
  p_location_name TEXT,
  p_formatted_address TEXT,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_contact_phone TEXT,
  p_contact_email TEXT,
  p_contact_website TEXT,
  p_image_ids UUID[]
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user UUID := auth.uid();
  v_rec_id UUID;
  v_count INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF array_length(p_image_ids, 1) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'images_required'; END IF;
  IF char_length(BTRIM(COALESCE(p_why_recommend, ''))) NOT BETWEEN 20 AND 500 THEN RAISE EXCEPTION 'why_recommend_invalid'; END IF;
  IF p_location_name IS NULL OR p_formatted_address IS NULL OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'location_invalid'; END IF;
  IF NULLIF(BTRIM(COALESCE(p_contact_phone, '')), '') IS NULL
     AND NULLIF(BTRIM(COALESCE(p_contact_email, '')), '') IS NULL
     AND NULLIF(BTRIM(COALESCE(p_contact_website, '')), '') IS NULL THEN RAISE EXCEPTION 'contact_required'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('rec_submit:' || v_user::text));
  SELECT count(*) INTO v_count FROM public.vendor_recommendations WHERE recommender_id = v_user AND created_at > now() - interval '24 hours';
  IF v_count >= 5 THEN RAISE EXCEPTION 'rate_limited'; END IF;

  INSERT INTO public.vendor_recommendations (
    recommender_id, vendor_name, vendor_name_normalized, description, category_id, vendor_address,
    why_recommend, google_place_id, location_name, formatted_address, latitude, longitude,
    contact_phone, contact_email, contact_website, image_attested_at, status
  ) VALUES (
    v_user, BTRIM(p_vendor_name), lower(BTRIM(p_vendor_name)), BTRIM(p_description), p_category_id, BTRIM(p_formatted_address),
    BTRIM(p_why_recommend), NULLIF(BTRIM(p_google_place_id), ''), BTRIM(p_location_name), BTRIM(p_formatted_address), p_latitude, p_longitude,
    NULLIF(BTRIM(p_contact_phone), ''), NULLIF(BTRIM(p_contact_email), ''), NULLIF(BTRIM(p_contact_website), ''), now(), 'pending'
  ) RETURNING id INTO v_rec_id;

  UPDATE public.recommendation_images
     SET recommendation_id = v_rec_id, is_staged = false, sort_order = staged.ordinality - 1
    FROM unnest(p_image_ids) WITH ORDINALITY AS staged(id, ordinality)
   WHERE recommendation_images.id = staged.id
     AND recommendation_images.owner_id = v_user
     AND recommendation_images.is_staged
     AND recommendation_images.removed_at IS NULL;
  IF (SELECT count(*) FROM public.recommendation_images WHERE recommendation_id = v_rec_id AND NOT is_staged AND removed_at IS NULL) <> array_length(p_image_ids, 1) THEN
    RAISE EXCEPTION 'staged_images_invalid';
  END IF;
  RETURN v_rec_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_recommendation_with_evidence(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_recommendation_with_evidence(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_recommendation(p_rec_id UUID, p_action TEXT, p_reason TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_recommender_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_action NOT IN ('approve', 'reject', 'request_changes') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  IF p_action = 'request_changes' AND char_length(BTRIM(COALESCE(p_reason, ''))) < 10 THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT recommender_id INTO v_recommender_id FROM public.vendor_recommendations WHERE id = p_rec_id;
  IF NOT FOUND OR v_recommender_id = auth.uid() THEN RAISE EXCEPTION 'not_found_or_already_reviewed'; END IF;
  UPDATE public.vendor_recommendations
     SET status = CASE p_action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'changes_requested' END,
         reviewer_id = auth.uid(), reviewed_at = now(), rejection_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE NULL END,
         changes_requested_at = CASE WHEN p_action = 'request_changes' THEN now() ELSE NULL END,
         changes_requested_reason = CASE WHEN p_action = 'request_changes' THEN BTRIM(p_reason) ELSE NULL END
   WHERE id = p_rec_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found_or_already_reviewed'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_recommendation_rewards_for_order(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_commission RECORD; v_wallet_id UUID; v_pending BIGINT; v_amount BIGINT; v_reversed INTEGER := 0;
BEGIN
  FOR v_commission IN SELECT rc.id, rc.recommender_id, ROUND(rc.amount * 100)::BIGINT AS amount_sen FROM public.recommendation_commissions rc WHERE rc.order_id = p_order_id AND rc.status = 'pending' ORDER BY rc.id FOR UPDATE OF rc SKIP LOCKED LOOP
    SELECT id, pending_earnings_sen INTO v_wallet_id, v_pending FROM public.wallets WHERE user_id = v_commission.recommender_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
    v_amount := v_commission.amount_sen;
    IF v_pending < v_amount THEN RAISE EXCEPTION 'pending_wallet_balance_mismatch'; END IF;
    UPDATE public.wallets SET pending_earnings_sen = pending_earnings_sen - v_amount, updated_at = now() WHERE id = v_wallet_id;
    INSERT INTO public.wallet_transactions (user_id, wallet_id, type, amount_sen, bucket, direction, note)
    VALUES (v_commission.recommender_id, v_wallet_id, 'earnings_reverse', v_amount, 'pending_earnings', 'debit', 'Recommendation reward reversed — financial outcome');
    UPDATE public.recommendation_commissions SET status = 'reversed', reversed_at = now() WHERE id = v_commission.id AND status = 'pending';
    v_reversed := v_reversed + 1;
  END LOOP;
  RETURN v_reversed;
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_recommendation_rewards_for_order(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_recommendation_rewards_for_order(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.reverse_recommendation_rewards_on_order_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'refunded', 'chargeback', 'fraud') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.reverse_recommendation_rewards_for_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_financial_outcome(
  p_order_id UUID, p_status TEXT, p_actor_id UUID DEFAULT NULL, p_provider_event_id TEXT DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor UUID := auth.uid(); v_reversed INTEGER;
BEGIN
  IF p_status NOT IN ('chargeback', 'fraud') THEN RAISE EXCEPTION 'invalid_financial_outcome'; END IF;
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' AND (v_actor IS NULL OR NOT public.is_admin(v_actor)) THEN RAISE EXCEPTION 'admin_required'; END IF;
  UPDATE public.orders SET status = p_status, updated_at = now() WHERE id = p_order_id AND status IS DISTINCT FROM p_status;
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN RAISE EXCEPTION 'order_not_found'; END IF;
  SELECT public.reverse_recommendation_rewards_for_order(p_order_id) INTO v_reversed;
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, after_data, note)
  VALUES (COALESCE(v_actor, p_actor_id), 'order.' || p_status, 'order', p_order_id, jsonb_build_object('status', p_status, 'provider_event_id', p_provider_event_id), 'Pending recommendation rewards reversed');
  RETURN v_reversed;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_order_financial_outcome(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_financial_outcome(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN ('draft','pending_payment','paid','completed','cancelled','refunded','chargeback','fraud'));

DROP TRIGGER IF EXISTS recommendation_rewards_order_status_reversal ON public.orders;
CREATE TRIGGER recommendation_rewards_order_status_reversal AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.reverse_recommendation_rewards_on_order_status();

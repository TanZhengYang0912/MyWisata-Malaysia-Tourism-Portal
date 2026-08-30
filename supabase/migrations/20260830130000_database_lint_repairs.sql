-- Forward-only repairs for three functions reported by `supabase db lint`.
-- No historical migration or business row is rewritten.

-- The hardened KYC flow uses begin_kyc_submission/finalize_kyc_submission.
-- This legacy RPC was already revoked from every application role and still
-- referenced a column that has never existed on kyc_submissions.
DROP FUNCTION IF EXISTS public.submit_kyc(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.clear_matured_recommendation_rewards()
RETURNS TABLE (
  commission_id UUID,
  user_id UUID,
  order_id UUID,
  action TEXT,
  amount_sen BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reward RECORD;
  v_wallet_id UUID;
  v_wallet_pending BIGINT;
  v_amount_sen BIGINT;
  v_available_txn_id UUID;
BEGIN
  FOR v_reward IN
    SELECT
      rc.id,
      rc.recommender_id,
      rc.order_id,
      ROUND(rc.amount * 100)::BIGINT AS amount_sen,
      LOWER(COALESCE(o.status, '')) AS order_status,
      u.tier,
      u.kyc_status
    FROM public.recommendation_commissions rc
    JOIN public.users u ON u.id = rc.recommender_id
    LEFT JOIN public.orders o ON o.id = rc.order_id
    WHERE rc.status = 'pending'
      AND (
        LOWER(COALESCE(o.status, '')) IN ('cancelled', 'refunded')
        OR (rc.hold_until IS NOT NULL AND rc.hold_until <= now())
      )
    ORDER BY rc.hold_until, rc.id
    FOR UPDATE OF rc SKIP LOCKED
  LOOP
    commission_id := v_reward.id;
    user_id := v_reward.recommender_id;
    order_id := v_reward.order_id;
    amount_sen := v_reward.amount_sen;

    IF v_reward.order_status IN ('cancelled', 'refunded') THEN
      SELECT w.id, w.pending_earnings_sen
        INTO v_wallet_id, v_wallet_pending
        FROM public.wallets w
       WHERE w.user_id = v_reward.recommender_id
       FOR UPDATE;
      IF NOT FOUND THEN
        action := 'skipped_wallet';
        RETURN NEXT;
        CONTINUE;
      END IF;
      IF v_wallet_pending < v_reward.amount_sen THEN
        RAISE EXCEPTION 'pending_wallet_balance_mismatch for recommendation commission %', v_reward.id;
      END IF;

      UPDATE public.wallets w
         SET pending_earnings_sen = w.pending_earnings_sen - v_reward.amount_sen,
             updated_at = now()
       WHERE w.id = v_wallet_id;

      INSERT INTO public.wallet_transactions
        (user_id, wallet_id, type, amount_sen, bucket, direction, note)
      VALUES
        (v_reward.recommender_id, v_wallet_id, 'earnings_reverse', v_reward.amount_sen,
         'pending_earnings', 'debit', 'Recommendation reward reversed — order cancelled or refunded');

      UPDATE public.recommendation_commissions
         SET status = 'reversed', reversed_at = now()
       WHERE id = v_reward.id AND status = 'pending';

      action := 'reversed';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF v_reward.order_id IS NOT NULL AND v_reward.order_status = '' THEN
      action := 'skipped_missing_order';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF v_reward.tier <> 'kyc_verified' OR v_reward.kyc_status <> 'approved' THEN
      action := 'skipped_kyc';
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT w.id, w.pending_earnings_sen
      INTO v_wallet_id, v_wallet_pending
      FROM public.wallets w
     WHERE w.user_id = v_reward.recommender_id
     FOR UPDATE;
    IF NOT FOUND THEN
      action := 'skipped_wallet';
      RETURN NEXT;
      CONTINUE;
    END IF;
    IF v_wallet_pending < v_reward.amount_sen THEN
      RAISE EXCEPTION 'pending_wallet_balance_mismatch for recommendation commission %', v_reward.id;
    END IF;

    UPDATE public.wallets w
       SET pending_earnings_sen = w.pending_earnings_sen - v_reward.amount_sen,
           earnings_sen = w.earnings_sen + v_reward.amount_sen,
           updated_at = now()
     WHERE w.id = v_wallet_id;

    INSERT INTO public.wallet_transactions
      (user_id, wallet_id, type, amount_sen, bucket, direction, note)
    VALUES
      (v_reward.recommender_id, v_wallet_id, 'earnings_confirm', v_reward.amount_sen,
       'pending_earnings', 'debit', 'Recommendation reward hold cleared');

    INSERT INTO public.wallet_transactions
      (user_id, wallet_id, type, amount_sen, bucket, direction, note)
    VALUES
      (v_reward.recommender_id, v_wallet_id, 'earnings_confirm', v_reward.amount_sen,
       'earnings', 'credit', 'Recommendation reward available after hold period')
    RETURNING id INTO v_available_txn_id;

    UPDATE public.recommendation_commissions
       SET status = 'confirmed', confirmed_at = now(), wallet_txn_id = v_available_txn_id
     WHERE id = v_reward.id AND status = 'pending';

    action := 'cleared';
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_matured_recommendation_rewards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_matured_recommendation_rewards() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_review_recommendation_translation(
  p_translation_id UUID,
  p_rec_id UUID,
  p_translated_text TEXT,
  p_status TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entity_type TEXT;
  v_entity_id UUID;
  v_field TEXT;
  v_source_hash TEXT;
  v_translation_status TEXT;
  v_recommendation_status TEXT;
  v_source_text TEXT;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  IF p_status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'invalid_translation_status'; END IF;
  IF p_translated_text IS NULL OR length(trim(p_translated_text)) = 0 OR length(p_translated_text) > 2000 OR p_translated_text ~ '<[^>]+>' THEN
    RAISE EXCEPTION 'invalid_translation_text';
  END IF;

  SELECT entity_type, entity_id, field, source_hash, status
    INTO v_entity_type, v_entity_id, v_field, v_source_hash, v_translation_status
    FROM public.content_translations
   WHERE id = p_translation_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'translation_not_found'; END IF;
  IF v_entity_type <> 'vendor_recommendation' OR v_entity_id <> p_rec_id OR v_field NOT IN ('name', 'description') THEN
    RAISE EXCEPTION 'invalid_translation_target';
  END IF;
  IF v_translation_status <> 'draft' THEN RAISE EXCEPTION 'translation_not_draft'; END IF;

  SELECT status, CASE WHEN v_field = 'name' THEN vendor_name ELSE description END
    INTO v_recommendation_status, v_source_text
    FROM public.vendor_recommendations
   WHERE id = p_rec_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation_not_found'; END IF;
  IF v_recommendation_status <> 'approved' THEN RAISE EXCEPTION 'recommendation_not_approved'; END IF;
  IF v_source_text IS NULL OR encode(extensions.digest(v_source_text, 'sha256'), 'hex') <> v_source_hash THEN
    RAISE EXCEPTION 'stale_translation';
  END IF;

  UPDATE public.content_translations
     SET translated_text = trim(p_translated_text),
         status = p_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_translation_id
     AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'translation_not_draft'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_recommendation_translation(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_recommendation_translation(UUID, UUID, TEXT, TEXT) TO authenticated;

-- Restore the invariant that every application user owns exactly one wallet.
-- Existing wallet rows and balances are intentionally left unchanged.

CREATE OR REPLACE FUNCTION public.ensure_wallet_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_wallet_for_user()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ensure_wallet_after_user_insert ON public.users;
CREATE TRIGGER ensure_wallet_after_user_insert
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_wallet_for_user();

INSERT INTO public.wallets (user_id)
SELECT u.id
FROM public.users AS u
ON CONFLICT (user_id) DO NOTHING;

-- Credit a paid Stripe top-up once, including under concurrent event replay.
-- The immutable Stripe event ID is both the ledger idempotency key and the
-- payload-integrity boundary.
CREATE OR REPLACE FUNCTION public.credit_topup(
  p_user_id         UUID,
  p_amount_sen      BIGINT,
  p_stripe_event_id TEXT,
  p_stripe_ref      TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_wallet_id         UUID;
  v_transaction_id    UUID;
  v_existing_user_id  UUID;
  v_existing_amount   BIGINT;
  v_existing_type     TEXT;
  v_existing_bucket   TEXT;
  v_existing_direction TEXT;
BEGIN
  IF p_amount_sen IS NULL OR p_amount_sen <= 0 THEN
    RAISE EXCEPTION 'invalid_topup_amount' USING ERRCODE = '22023';
  END IF;

  IF p_stripe_event_id IS NULL OR btrim(p_stripe_event_id) = '' THEN
    RAISE EXCEPTION 'invalid_stripe_event_id' USING ERRCODE = '22023';
  END IF;

  SELECT id
    INTO v_wallet_id
    FROM public.wallets
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found for user %', p_user_id;
  END IF;

  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction,
     stripe_event_id, stripe_ref, note)
  VALUES
    (p_user_id, v_wallet_id, 'topup', p_amount_sen, 'topup', 'credit',
     btrim(p_stripe_event_id), p_stripe_ref, 'Stripe Checkout top-up')
  ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING id INTO v_transaction_id;

  IF v_transaction_id IS NULL THEN
    SELECT user_id, amount_sen, type, bucket, direction
      INTO v_existing_user_id, v_existing_amount, v_existing_type,
           v_existing_bucket, v_existing_direction
      FROM public.wallet_transactions
     WHERE stripe_event_id = btrim(p_stripe_event_id);

    IF v_existing_user_id IS DISTINCT FROM p_user_id
       OR v_existing_amount IS DISTINCT FROM p_amount_sen
       OR v_existing_type IS DISTINCT FROM 'topup'
       OR v_existing_bucket IS DISTINCT FROM 'topup'
       OR v_existing_direction IS DISTINCT FROM 'credit' THEN
      RAISE EXCEPTION 'stripe_event_id_payload_mismatch';
    END IF;

    RETURN;
  END IF;

  UPDATE public.wallets
     SET topup_sen = topup_sen + p_amount_sen,
         updated_at = now()
   WHERE id = v_wallet_id;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_topup(UUID, BIGINT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_topup(UUID, BIGINT, TEXT, TEXT)
  TO service_role;

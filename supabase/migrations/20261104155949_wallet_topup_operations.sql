CREATE SCHEMA IF NOT EXISTS app_private;

CREATE TABLE app_private.wallet_topup_operations (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount_sen bigint NOT NULL CHECK (amount_sen > 0),
  currency text NOT NULL DEFAULT 'MYR' CHECK (currency = 'MYR'),
  is_live boolean NOT NULL,
  state text NOT NULL CHECK (state IN (
    'creating', 'open', 'checking', 'paid_pending_credit', 'credited',
    'expired', 'cancelled', 'failed'
  )),
  customer_email text,
  customer_name text,
  stripe_customer_id text,
  stripe_customer_idempotency_key text NOT NULL,
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  stripe_session_idempotency_key text NOT NULL UNIQUE,
  checkout_url text,
  success_url text NOT NULL,
  cancel_url text NOT NULL,
  session_expires_at timestamptz,
  first_provider_attempt_at timestamptz,
  last_provider_check_at timestamptz,
  reconcile_lease_token uuid,
  reconcile_lease_expires_at timestamptz,
  email_state text NOT NULL DEFAULT 'not_required'
    CHECK (email_state IN ('not_required', 'pending', 'queued')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((state = 'open' AND stripe_session_id IS NOT NULL AND checkout_url IS NOT NULL)
      OR state <> 'open')
);

CREATE UNIQUE INDEX wallet_topup_one_active_operation_per_owner_idx
  ON app_private.wallet_topup_operations(owner_user_id)
  WHERE state IN ('creating', 'open', 'checking', 'paid_pending_credit');

CREATE INDEX wallet_topup_reconcile_due_idx
  ON app_private.wallet_topup_operations(last_provider_check_at, created_at)
  WHERE state IN ('creating', 'open', 'checking', 'paid_pending_credit')
     OR email_state = 'pending';

CREATE TABLE app_private.wallet_topup_provider_payments (
  stripe_session_id text PRIMARY KEY,
  stripe_payment_intent_id text UNIQUE,
  operation_id uuid REFERENCES app_private.wallet_topup_operations(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount_sen bigint NOT NULL CHECK (amount_sen > 0),
  currency text NOT NULL CHECK (currency = 'MYR'),
  is_live boolean NOT NULL,
  first_event_id text NOT NULL UNIQUE,
  credited_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX wallet_topup_ledger_provider_reference_idx
  ON public.wallet_transactions(stripe_ref)
  WHERE type='topup' AND stripe_ref IS NOT NULL;

REVOKE ALL ON TABLE app_private.wallet_topup_operations,
  app_private.wallet_topup_provider_payments FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.prepare_wallet_topup_operation(
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_amount_sen bigint,
  p_is_live boolean,
  p_customer_email text,
  p_customer_name text,
  p_success_url text,
  p_cancel_url text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_operation app_private.wallet_topup_operations%ROWTYPE;
  v_customer_id text;
BEGIN
  IF p_operation_id IS NULL OR p_owner_user_id IS NULL OR p_amount_sen IS NULL
     OR p_amount_sen < 200 OR p_amount_sen > 99999999
     OR p_success_url IS NULL OR p_cancel_url IS NULL THEN
    RAISE EXCEPTION 'wallet_topup_invalid_request' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text, 824761));
  PERFORM 1 FROM public.users u
   WHERE u.id = p_owner_user_id AND u.status = 'active'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_topup_account_inactive'; END IF;

  SELECT u.stripe_customer_id INTO v_customer_id
    FROM public.users u WHERE u.id = p_owner_user_id;

  SELECT * INTO v_operation
    FROM app_private.wallet_topup_operations o
   WHERE o.id = p_operation_id AND o.owner_user_id = p_owner_user_id
   FOR UPDATE;
  IF FOUND THEN
    IF v_operation.amount_sen <> p_amount_sen OR v_operation.is_live <> p_is_live THEN
      RAISE EXCEPTION 'wallet_topup_operation_payload_mismatch';
    END IF;
    RETURN to_jsonb(v_operation) || jsonb_build_object('reused', true);
  END IF;

  SELECT * INTO v_operation
    FROM app_private.wallet_topup_operations o
   WHERE o.owner_user_id = p_owner_user_id
     AND o.state IN ('creating', 'open', 'checking', 'paid_pending_credit')
   FOR UPDATE;
  IF FOUND THEN
    IF v_operation.amount_sen <> p_amount_sen THEN
      RAISE EXCEPTION 'wallet_topup_different_active_amount';
    END IF;
    RETURN to_jsonb(v_operation) || jsonb_build_object('reused', true);
  END IF;

  INSERT INTO app_private.wallet_topup_operations (
    id, owner_user_id, amount_sen, is_live, state, customer_email,
    customer_name, stripe_customer_id, stripe_customer_idempotency_key,
    stripe_session_idempotency_key, success_url, cancel_url, email_state
  ) VALUES (
    p_operation_id, p_owner_user_id, p_amount_sen, p_is_live, 'creating',
    nullif(btrim(p_customer_email), ''), nullif(btrim(p_customer_name), ''),
    v_customer_id, 'wallet-topup-customer:' || p_owner_user_id::text,
    'wallet-topup-session:' || p_operation_id::text, p_success_url,
    p_cancel_url, 'not_required'
  ) RETURNING * INTO v_operation;

  RETURN to_jsonb(v_operation) || jsonb_build_object('reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.record_wallet_topup_customer(
  p_operation_id uuid, p_owner_user_id uuid, p_customer_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE v_operation app_private.wallet_topup_operations%ROWTYPE; v_current text;
BEGIN
  SELECT * INTO v_operation FROM app_private.wallet_topup_operations
   WHERE id = p_operation_id AND owner_user_id = p_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_owner_user_id AND status='active') THEN
    RAISE EXCEPTION 'wallet_topup_account_inactive';
  END IF;
  SELECT stripe_customer_id INTO v_current FROM public.users WHERE id=p_owner_user_id FOR UPDATE;
  IF v_current IS NOT NULL AND v_current <> p_customer_id THEN
    RAISE EXCEPTION 'wallet_topup_customer_conflict';
  END IF;
  UPDATE public.users SET stripe_customer_id=p_customer_id
   WHERE id=p_owner_user_id AND stripe_customer_id IS NULL;
  UPDATE app_private.wallet_topup_operations SET stripe_customer_id=p_customer_id,
    updated_at=clock_timestamp() WHERE id=p_operation_id
      AND stripe_customer_id IS DISTINCT FROM p_customer_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.record_wallet_topup_session(
  p_operation_id uuid, p_owner_user_id uuid, p_session_id text,
  p_checkout_url text, p_expires_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE v_operation app_private.wallet_topup_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_operation FROM app_private.wallet_topup_operations
   WHERE id=p_operation_id AND owner_user_id=p_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_topup_operation_not_found'; END IF;
  IF v_operation.stripe_session_id IS NOT NULL AND v_operation.stripe_session_id <> p_session_id THEN
    RAISE EXCEPTION 'wallet_topup_session_conflict';
  END IF;
  IF v_operation.state = 'credited' THEN
    RETURN to_jsonb(v_operation);
  ELSIF v_operation.state IN ('creating','checking','open','paid_pending_credit') THEN
    UPDATE app_private.wallet_topup_operations SET stripe_session_id=p_session_id,
      checkout_url=p_checkout_url, session_expires_at=p_expires_at,
      first_provider_attempt_at=coalesce(first_provider_attempt_at,clock_timestamp()),
      state='open', updated_at=clock_timestamp()
     WHERE id=p_operation_id;
  ELSE
    -- A late Stripe response after cancellation/expiry must remain recoverable,
    -- but must never restore a customer-facing payment URL or release the slot.
    UPDATE app_private.wallet_topup_operations SET stripe_session_id=p_session_id,
      checkout_url=NULL, session_expires_at=p_expires_at,
      first_provider_attempt_at=coalesce(first_provider_attempt_at,clock_timestamp()),
      state='checking', updated_at=clock_timestamp()
     WHERE id=p_operation_id;
  END IF;
  SELECT * INTO v_operation FROM app_private.wallet_topup_operations WHERE id=p_operation_id;
  RETURN to_jsonb(v_operation);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.get_wallet_topup_operation(
  p_operation_id uuid, p_owner_user_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
  SELECT to_jsonb(o) FROM app_private.wallet_topup_operations o
   WHERE o.id=p_operation_id AND o.owner_user_id=p_owner_user_id
     AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=p_owner_user_id AND u.status='active');
$$;

CREATE OR REPLACE FUNCTION app_private.get_active_wallet_topup_operation(
  p_owner_user_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
  SELECT to_jsonb(o) FROM app_private.wallet_topup_operations o
   WHERE o.owner_user_id=p_owner_user_id
     AND o.state IN ('creating','open','checking','paid_pending_credit')
     AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=p_owner_user_id AND u.status='active')
   ORDER BY o.created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_private.update_wallet_topup_provider_state(
  p_operation_id uuid, p_owner_user_id uuid, p_state text,
  p_session_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE v_operation app_private.wallet_topup_operations%ROWTYPE;
BEGIN
  IF p_state NOT IN ('checking','open','expired','cancelled','failed','paid_pending_credit') THEN
    RAISE EXCEPTION 'wallet_topup_state_invalid';
  END IF;
  SELECT * INTO v_operation FROM app_private.wallet_topup_operations
   WHERE id=p_operation_id AND owner_user_id=p_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_topup_operation_not_found'; END IF;
  IF v_operation.state = 'credited' THEN
    RETURN to_jsonb(v_operation);
  ELSIF v_operation.state NOT IN ('expired','cancelled','failed') OR p_state='checking' THEN
    UPDATE app_private.wallet_topup_operations SET
      state=p_state,
      last_provider_check_at=clock_timestamp(), updated_at=clock_timestamp()
     WHERE id=p_operation_id;
  END IF;
  SELECT * INTO v_operation FROM app_private.wallet_topup_operations WHERE id=p_operation_id;
  RETURN to_jsonb(v_operation);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.apply_wallet_topup_payment(
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_sen bigint,
  p_currency text,
  p_is_live boolean,
  p_expected_is_live boolean,
  p_payment_status text,
  p_event_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_operation app_private.wallet_topup_operations%ROWTYPE;
  v_identity app_private.wallet_topup_provider_payments%ROWTYPE;
  v_ledger_exists boolean;
  v_ledger public.wallet_transactions%ROWTYPE;
BEGIN
  IF p_payment_status <> 'paid' OR p_amount_sen IS NULL OR p_amount_sen <= 0
     OR upper(coalesce(p_currency,'')) <> 'MYR' OR p_is_live IS DISTINCT FROM p_expected_is_live
     OR nullif(p_session_id,'') IS NULL OR nullif(p_event_id,'') IS NULL THEN
    RAISE EXCEPTION 'wallet_topup_payment_unverified';
  END IF;

  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_operation FROM app_private.wallet_topup_operations
     WHERE id=p_operation_id AND owner_user_id=p_owner_user_id FOR UPDATE;
    IF NOT FOUND OR v_operation.amount_sen <> p_amount_sen
       OR v_operation.is_live IS DISTINCT FROM p_is_live
       OR v_operation.state IN ('cancelled','expired','failed') THEN
      RAISE EXCEPTION 'wallet_topup_operation_payment_mismatch';
    END IF;
    IF v_operation.stripe_session_id IS NOT NULL AND v_operation.stripe_session_id <> p_session_id THEN
      RAISE EXCEPTION 'wallet_topup_session_mismatch';
    END IF;
  END IF;

  SELECT * INTO v_identity FROM app_private.wallet_topup_provider_payments
   WHERE stripe_session_id=p_session_id OR
     (p_payment_intent_id IS NOT NULL AND stripe_payment_intent_id=p_payment_intent_id)
   FOR UPDATE;
  IF FOUND THEN
    IF v_identity.owner_user_id IS DISTINCT FROM p_owner_user_id
       OR v_identity.amount_sen IS DISTINCT FROM p_amount_sen
       OR v_identity.currency IS DISTINCT FROM upper(p_currency)
       OR v_identity.is_live IS DISTINCT FROM p_is_live
       OR v_identity.operation_id IS DISTINCT FROM p_operation_id
       OR v_identity.stripe_session_id IS DISTINCT FROM p_session_id
       OR v_identity.stripe_payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN
      RAISE EXCEPTION 'wallet_topup_provider_identity_conflict';
    END IF;
    RETURN jsonb_build_object('credited', false, 'alreadyProcessed', true);
  END IF;

  INSERT INTO app_private.wallet_topup_provider_payments (
    stripe_session_id, stripe_payment_intent_id, operation_id, owner_user_id,
    amount_sen, currency, is_live, first_event_id
  ) VALUES (
    p_session_id, p_payment_intent_id, p_operation_id, p_owner_user_id,
    p_amount_sen, upper(p_currency), p_is_live, p_event_id
  );

  v_ledger_exists := false;
  IF p_payment_intent_id IS NOT NULL THEN
    SELECT * INTO v_ledger FROM public.wallet_transactions
     WHERE stripe_ref=p_payment_intent_id AND type='topup' AND bucket='topup' AND direction='credit'
     LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      IF v_ledger.user_id IS DISTINCT FROM p_owner_user_id
         OR v_ledger.amount_sen IS DISTINCT FROM p_amount_sen THEN
        RAISE EXCEPTION 'wallet_topup_payment_ledger_mismatch';
      END IF;
      v_ledger_exists := true;
    END IF;
  END IF;
  IF NOT v_ledger_exists THEN
    SELECT EXISTS (SELECT 1 FROM public.wallet_transactions
      WHERE stripe_event_id=p_event_id) INTO v_ledger_exists;
  END IF;
  IF NOT v_ledger_exists THEN
    PERFORM public.credit_topup(p_owner_user_id,p_amount_sen,p_event_id,p_payment_intent_id);
  END IF;

  IF p_operation_id IS NOT NULL THEN
    UPDATE app_private.wallet_topup_operations SET
      stripe_session_id=p_session_id,
      stripe_payment_intent_id=p_payment_intent_id,
      checkout_url=NULL,
      state='credited', email_state=CASE WHEN v_ledger_exists THEN email_state ELSE 'pending' END,
      updated_at=clock_timestamp()
     WHERE id=p_operation_id;
  END IF;
  RETURN jsonb_build_object('credited', NOT v_ledger_exists, 'alreadyProcessed', v_ledger_exists);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.mark_wallet_topup_email_queued(
  p_operation_id uuid, p_owner_user_id uuid
) RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
  UPDATE app_private.wallet_topup_operations SET email_state='queued', updated_at=clock_timestamp()
   WHERE id=p_operation_id AND owner_user_id=p_owner_user_id AND state='credited'
     AND email_state='pending'
  RETURNING true;
$$;

CREATE OR REPLACE FUNCTION app_private.claim_wallet_topup_reconciliation(
  p_limit integer, p_lease_seconds integer
) RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 1800 THEN
    RAISE EXCEPTION 'wallet_topup_reconcile_bounds_invalid';
  END IF;
  RETURN QUERY
  WITH due AS (
    SELECT id FROM app_private.wallet_topup_operations
     WHERE (state IN ('creating','open','checking','paid_pending_credit')
         OR email_state='pending')
       AND coalesce(reconcile_lease_expires_at,'-infinity'::timestamptz) <= clock_timestamp()
       AND coalesce(last_provider_check_at,'-infinity'::timestamptz) < clock_timestamp()-interval '1 minute'
     ORDER BY coalesce(last_provider_check_at,created_at),created_at
     LIMIT p_limit FOR UPDATE SKIP LOCKED
  ), claimed AS (
  UPDATE app_private.wallet_topup_operations o SET
    reconcile_lease_token=gen_random_uuid(),
    reconcile_lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),
    last_provider_check_at=clock_timestamp(), updated_at=clock_timestamp()
   FROM due WHERE o.id=due.id RETURNING o.*
  ) SELECT to_jsonb(c) FROM claimed c;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.finish_wallet_topup_reconciliation(
  p_operation_id uuid, p_lease_token uuid, p_state text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
BEGIN
  UPDATE app_private.wallet_topup_operations SET
    state=CASE WHEN state='credited' OR p_state IS NULL THEN state ELSE p_state END,
    reconcile_lease_token=NULL,reconcile_lease_expires_at=NULL,
    updated_at=clock_timestamp()
   WHERE id=p_operation_id AND reconcile_lease_token=p_lease_token
     AND reconcile_lease_expires_at>clock_timestamp()
     AND (p_state IS NULL OR p_state IN ('open','checking','paid_pending_credit','expired','cancelled','failed'));
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_wallet_topup_operation(
  p_operation_id uuid,p_owner_user_id uuid,p_amount_sen bigint,p_is_live boolean,
  p_customer_email text,p_customer_name text,p_success_url text,p_cancel_url text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp
AS $$ SELECT app_private.prepare_wallet_topup_operation($1,$2,$3,$4,$5,$6,$7,$8); $$;
CREATE OR REPLACE FUNCTION public.record_wallet_topup_customer(uuid,uuid,text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp
AS $$ SELECT app_private.record_wallet_topup_customer($1,$2,$3); $$;
CREATE OR REPLACE FUNCTION public.record_wallet_topup_session(uuid,uuid,text,text,timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp
AS $$ SELECT app_private.record_wallet_topup_session($1,$2,$3,$4,$5); $$;
CREATE OR REPLACE FUNCTION public.get_wallet_topup_operation(uuid,uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp
AS $$ SELECT app_private.get_wallet_topup_operation($1,$2); $$;
CREATE OR REPLACE FUNCTION public.get_active_wallet_topup_operation(uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp
AS $$ SELECT app_private.get_active_wallet_topup_operation($1); $$;
CREATE OR REPLACE FUNCTION public.update_wallet_topup_provider_state(uuid,uuid,text,text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp
AS $$ SELECT app_private.update_wallet_topup_provider_state($1,$2,$3,$4); $$;
CREATE OR REPLACE FUNCTION public.apply_wallet_topup_payment(uuid,uuid,text,text,bigint,text,boolean,boolean,text,text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp
AS $$ SELECT app_private.apply_wallet_topup_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10); $$;
CREATE OR REPLACE FUNCTION public.mark_wallet_topup_email_queued(uuid,uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp
AS $$ SELECT app_private.mark_wallet_topup_email_queued($1,$2); $$;
CREATE OR REPLACE FUNCTION public.claim_wallet_topup_reconciliation(integer,integer)
RETURNS SETOF jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp
AS $$ SELECT * FROM app_private.claim_wallet_topup_reconciliation($1,$2); $$;
CREATE OR REPLACE FUNCTION public.finish_wallet_topup_reconciliation(uuid,uuid,text DEFAULT NULL)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp
AS $$ SELECT app_private.finish_wallet_topup_reconciliation($1,$2,$3); $$;

REVOKE ALL ON FUNCTION app_private.prepare_wallet_topup_operation(uuid,uuid,bigint,boolean,text,text,text,text),
  app_private.record_wallet_topup_customer(uuid,uuid,text),
  app_private.record_wallet_topup_session(uuid,uuid,text,text,timestamptz),
  app_private.get_wallet_topup_operation(uuid,uuid),
  app_private.get_active_wallet_topup_operation(uuid),
  app_private.update_wallet_topup_provider_state(uuid,uuid,text,text),
  app_private.apply_wallet_topup_payment(uuid,uuid,text,text,bigint,text,boolean,boolean,text,text),
  app_private.mark_wallet_topup_email_queued(uuid,uuid),
  app_private.claim_wallet_topup_reconciliation(integer,integer),
  app_private.finish_wallet_topup_reconciliation(uuid,uuid,text),
  public.prepare_wallet_topup_operation(uuid,uuid,bigint,boolean,text,text,text,text),
  public.record_wallet_topup_customer(uuid,uuid,text),
  public.record_wallet_topup_session(uuid,uuid,text,text,timestamptz),
  public.get_wallet_topup_operation(uuid,uuid),
  public.get_active_wallet_topup_operation(uuid),
  public.update_wallet_topup_provider_state(uuid,uuid,text,text),
  public.apply_wallet_topup_payment(uuid,uuid,text,text,bigint,text,boolean,boolean,text,text),
  public.mark_wallet_topup_email_queued(uuid,uuid),
  public.claim_wallet_topup_reconciliation(integer,integer),
  public.finish_wallet_topup_reconciliation(uuid,uuid,text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prepare_wallet_topup_operation(uuid,uuid,bigint,boolean,text,text,text,text),
  public.record_wallet_topup_customer(uuid,uuid,text),
  public.record_wallet_topup_session(uuid,uuid,text,text,timestamptz),
  public.get_wallet_topup_operation(uuid,uuid),
  public.get_active_wallet_topup_operation(uuid),
  public.update_wallet_topup_provider_state(uuid,uuid,text,text),
  public.apply_wallet_topup_payment(uuid,uuid,text,text,bigint,text,boolean,boolean,text,text),
  public.mark_wallet_topup_email_queued(uuid,uuid),
  public.claim_wallet_topup_reconciliation(integer,integer),
  public.finish_wallet_topup_reconciliation(uuid,uuid,text)
TO service_role;

GRANT USAGE ON SCHEMA app_private TO service_role;
GRANT EXECUTE ON FUNCTION app_private.prepare_wallet_topup_operation(uuid,uuid,bigint,boolean,text,text,text,text),
  app_private.record_wallet_topup_customer(uuid,uuid,text),
  app_private.record_wallet_topup_session(uuid,uuid,text,text,timestamptz),
  app_private.get_wallet_topup_operation(uuid,uuid),
  app_private.get_active_wallet_topup_operation(uuid),
  app_private.update_wallet_topup_provider_state(uuid,uuid,text,text),
  app_private.apply_wallet_topup_payment(uuid,uuid,text,text,bigint,text,boolean,boolean,text,text),
  app_private.mark_wallet_topup_email_queued(uuid,uuid),
  app_private.claim_wallet_topup_reconciliation(integer,integer),
  app_private.finish_wallet_topup_reconciliation(uuid,uuid,text)
TO service_role;

REVOKE ALL ON FUNCTION app_private.prepare_wallet_topup_operation(uuid,uuid,bigint,boolean,text,text,text,text),
  app_private.record_wallet_topup_customer(uuid,uuid,text),
  app_private.record_wallet_topup_session(uuid,uuid,text,text,timestamptz),
  app_private.get_wallet_topup_operation(uuid,uuid),
  app_private.get_active_wallet_topup_operation(uuid),
  app_private.update_wallet_topup_provider_state(uuid,uuid,text,text),
  app_private.apply_wallet_topup_payment(uuid,uuid,text,text,bigint,text,boolean,boolean,text,text),
  app_private.mark_wallet_topup_email_queued(uuid,uuid),
  app_private.claim_wallet_topup_reconciliation(integer,integer),
  app_private.finish_wallet_topup_reconciliation(uuid,uuid,text)
FROM PUBLIC, anon, authenticated;

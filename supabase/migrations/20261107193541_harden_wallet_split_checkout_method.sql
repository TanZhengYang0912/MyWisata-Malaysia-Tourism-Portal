-- Keep wallet balance reservation limited to wallet-backed checkout methods.
-- The original checkout hardening preceded moving this function to app_private.
DO $migration$
DECLARE
  v_definition TEXT := pg_get_functiondef(
    'app_private.reserve_wallet_split_checkout(uuid)'::regprocedure
  );
  v_owner_marker TEXT := $old$
  IF v_user IS NOT NULL AND v_session.user_id <> v_user THEN RAISE EXCEPTION 'checkout_not_owned'; END IF;
$old$;
  v_method_guard TEXT := $new$
  IF v_user IS NOT NULL AND v_session.user_id <> v_user THEN RAISE EXCEPTION 'checkout_not_owned'; END IF;
  IF v_session.payment_method NOT IN ('wallet', 'wallet_split') THEN
    RAISE EXCEPTION 'invalid_wallet_checkout_method';
  END IF;
$new$;
BEGIN
  v_definition := replace(v_definition, E'\r\n', E'\n');
  IF position('invalid_wallet_checkout_method' IN v_definition) = 0 THEN
    IF position(v_owner_marker IN v_definition) = 0 THEN
      RAISE EXCEPTION 'wallet reservation definition changed; inspect migration before applying';
    END IF;
    EXECUTE replace(v_definition, v_owner_marker, v_method_guard);
  END IF;
END;
$migration$;

-- A TOTP-backed aal2 token is not proof that the enrolled Passkey is still
-- active. Keep staff permission RPCs aligned with the server/API assurance gate.
DO $migration$
DECLARE
  v_oid oid := 'app_private.has_staff_permission(uuid, text)'::regprocedure;
  v_source text;
  v_body text;
BEGIN
  SELECT prosrc INTO STRICT v_source FROM pg_proc WHERE oid = v_oid;
  IF v_source ~* 'staff_authority_assurance' THEN
    RETURN;
  END IF;
  IF v_source !~* 'IF\s+app_private\.caller_lacks_aal2\(p_user_id\)\s+THEN\s+RETURN\s+FALSE;\s+END\s+IF;' THEN
    RAISE EXCEPTION 'unexpected_has_staff_permission_definition';
  END IF;

  v_body := regexp_replace(
    v_source,
    'IF\s+app_private\.caller_lacks_aal2\(p_user_id\)\s+THEN\s+RETURN\s+FALSE;\s+END\s+IF;',
    'IF NOT app_private.staff_authority_assurance() THEN RETURN FALSE; END IF; IF app_private.caller_lacks_aal2(p_user_id) THEN RETURN FALSE; END IF;',
    'i'
  );
  IF v_body = v_source OR v_body !~* 'staff_authority_assurance' THEN
    RAISE EXCEPTION 'staff_permission_assurance_replacement_failed';
  END IF;

  EXECUTE replace(pg_get_functiondef(v_oid), v_source, v_body);
END;
$migration$;

NOTIFY pgrst, 'reload schema';

-- gen_affiliate_code calls gen_random_bytes() which lives in the extensions
-- schema in Supabase.  The original function had no SET search_path, so
-- gen_random_bytes was not found at runtime.  Add extensions to search_path.

CREATE OR REPLACE FUNCTION gen_affiliate_code(
  p_user_id UUID
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = extensions, public, pg_temp
AS $$
DECLARE
  v_code    TEXT;
  v_attempt INT := 0;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT affiliate_code INTO v_code
    FROM affiliate_links
   WHERE user_id = p_user_id AND is_active = TRUE
   LIMIT 1;
  IF FOUND THEN RETURN v_code; END IF;

  LOOP
    v_code := 'AF-' || upper(substring(encode(gen_random_bytes(4), 'hex') FROM 1 FOR 6));
    BEGIN
      INSERT INTO affiliate_links (user_id, affiliate_code)
      VALUES (p_user_id, v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 5 THEN
        RAISE EXCEPTION 'affiliate_code_collision after 5 attempts';
      END IF;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION gen_affiliate_code(UUID) TO authenticated;

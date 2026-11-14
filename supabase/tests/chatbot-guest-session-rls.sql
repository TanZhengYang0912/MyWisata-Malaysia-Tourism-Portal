-- Security contract: guest transcript access is only available through the
-- server-side HttpOnly credential check; direct anon REST access is revoked.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['chatbot_sessions', 'chatbot_messages'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', v_table)::regclass) THEN
      RAISE EXCEPTION 'RLS is not enabled on %', v_table;
    END IF;
    IF has_table_privilege('anon', format('public.%I', v_table), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', v_table), 'INSERT') THEN
      RAISE EXCEPTION 'anon has direct access to %', v_table;
    END IF;
    IF has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT') THEN
      RAISE EXCEPTION 'authenticated can directly read private chat records in %', v_table;
    END IF;
    IF has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE') THEN
      RAISE EXCEPTION 'authenticated has direct write access to %', v_table;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = v_table AND policyname = 'demo_allow_all'
    ) THEN
      RAISE EXCEPTION 'demo_allow_all remains on %', v_table;
    END IF;
  END LOOP;
END;
$$;

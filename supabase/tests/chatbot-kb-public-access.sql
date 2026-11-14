-- Verify the exposed KB table keeps only public active-document reads.
BEGIN;
SET LOCAL statement_timeout = '20s';

DO $$
DECLARE
  v_relrowsecurity boolean;
BEGIN
  SELECT c.relrowsecurity INTO v_relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'chatbot_kb_documents';
  IF v_relrowsecurity IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'chatbot KB row-level security is not enabled';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'chatbot_kb_documents' AND policyname = 'demo_allow_all'
  ) THEN
    RAISE EXCEPTION 'chatbot KB demo_allow_all policy remains';
  END IF;
  IF has_table_privilege('anon', 'public.chatbot_kb_documents', 'INSERT')
     OR has_table_privilege('authenticated', 'public.chatbot_kb_documents', 'UPDATE') THEN
    RAISE EXCEPTION 'public roles retain direct chatbot KB write privileges';
  END IF;
  IF NOT has_table_privilege('anon', 'public.chatbot_kb_documents', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.chatbot_kb_documents', 'SELECT') THEN
    RAISE EXCEPTION 'public FAQ read privileges were not preserved';
  END IF;
END;
$$;

SELECT set_config('support_kb_public.active_id', gen_random_uuid()::text, true);
SELECT set_config('support_kb_public.inactive_id', gen_random_uuid()::text, true);
INSERT INTO public.chatbot_kb_documents (id, title, body, is_active)
VALUES
  (current_setting('support_kb_public.active_id')::uuid, 'RLS fixture active', 'Public fixture.', true),
  (current_setting('support_kb_public.inactive_id')::uuid, 'RLS fixture inactive', 'Private draft fixture.', false);

SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.chatbot_kb_documents
   WHERE id IN (current_setting('support_kb_public.active_id')::uuid, current_setting('support_kb_public.inactive_id')::uuid);
  IF v_count <> 1 THEN RAISE EXCEPTION 'anon can see inactive KB documents or cannot see active documents'; END IF;
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.chatbot_kb_documents
   WHERE id IN (current_setting('support_kb_public.active_id')::uuid, current_setting('support_kb_public.inactive_id')::uuid);
  IF v_count <> 1 THEN RAISE EXCEPTION 'authenticated users can see inactive KB documents or cannot see active documents'; END IF;
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM public.save_chatbot_kb_revision(
      NULL, gen_random_uuid(), 'RLS fixture', 'Draft body.', ARRAY[]::text[], NULL, '[]'::jsonb, 0, gen_random_uuid()
    );
    RAISE EXCEPTION 'non-admin KB author was accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'chatbot_kb_author_super_admin_required' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.publish_chatbot_kb_revision(
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 0, true
    );
    RAISE EXCEPTION 'non-admin KB reviewer was accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'chatbot_kb_reviewer_super_admin_required' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

ROLLBACK;

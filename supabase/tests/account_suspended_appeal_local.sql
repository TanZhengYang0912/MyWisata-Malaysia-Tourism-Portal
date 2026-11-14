\set ON_ERROR_STOP on

-- Disposable PostgreSQL harness for the existing two-phase appeal boundary.
-- It seeds only the columns used by the migrations and the existing appeal
-- fixture, then applies stage 1, exercises the service RPC, applies stage 2,
-- and runs account_suspended_appeal.sql.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;

CREATE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $function$
  SELECT current_setting('request.jwt.claim.role', true);
$function$;
CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$function$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  status text NOT NULL
);
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  session_id uuid,
  subject text NOT NULL,
  body text NOT NULL,
  category text NOT NULL,
  classification_method text,
  status text NOT NULL,
  operation_id uuid,
  operation_payload_hash text
);
CREATE UNIQUE INDEX support_tickets_user_operation_id_key
  ON public.support_tickets (user_id, operation_id)
  WHERE operation_id IS NOT NULL;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.support_tickets TO authenticated;
GRANT INSERT ON public.support_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.users TO service_role;
CREATE POLICY support_insert_own ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

INSERT INTO public.users (id, email, full_name, status)
VALUES ('00000000-0000-4000-8000-000000000099', 'stage-one@example.invalid', 'Stage One Fixture', 'suspended');

\ir ../migrations/20261111223100_account_suspended_appeal_write_boundary.sql

BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role","is_anonymous":false}', true);
DO $test$
DECLARE
  v_first jsonb;
  v_retry jsonb;
  v_operation_id uuid := '00000000-0000-4000-8000-000000000099';
  v_hash text := repeat('a', 64);
BEGIN
  v_first := public.create_account_suspension_appeal(
    '00000000-0000-4000-8000-000000000099', v_operation_id, v_hash,
    'Please review my suspended account', 'general'
  );
  v_retry := public.create_account_suspension_appeal(
    '00000000-0000-4000-8000-000000000099', v_operation_id, v_hash,
    'Please review my suspended account', 'general'
  );
  IF v_first->>'created' <> 'true' OR v_retry->>'created' <> 'false'
     OR v_first->>'id' IS DISTINCT FROM v_retry->>'id' THEN
    RAISE EXCEPTION 'stage-one service RPC did not safely replay the same operation';
  END IF;
END;
$test$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000099', true);
INSERT INTO public.support_tickets (user_id, subject, body, category, status)
VALUES ('00000000-0000-4000-8000-000000000099', 'Pre-lockdown direct write', 'Fixture before stage two', 'general', 'open');
ROLLBACK;

\ir ../migrations/20261111223200_account_suspended_appeal_direct_write_lockdown.sql
\ir account_suspended_appeal.sql

SELECT 'PASS: isolated stage-one API RPC, stage-two direct-write lockdown, and existing appeal regression fixture' AS result;

-- Execute with psql against an empty, disposable PostgreSQL database only.
-- This fixture installs the existing support ticket migrations, exercises the
-- reply/reopen/attachment RPCs with minimum schema dependencies, and rolls back.
\set ON_ERROR_STOP on

BEGIN;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE SCHEMA app_private;
CREATE SCHEMA storage;
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Minimal bucket metadata schema for the private attachment bucket migration.
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

-- The attachment migration revokes browser policies from this table. The
-- disposable fixture needs only the relation; it never stores real objects.
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL
);

CREATE TABLE auth.users (
  id uuid PRIMARY KEY
);

CREATE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  full_name text
);

CREATE TABLE public.roles (
  id serial PRIMARY KEY,
  name text UNIQUE NOT NULL
);

CREATE TABLE public.chatbot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id),
  guest_token_hash text,
  session_key text,
  channel text
);

CREATE TABLE public.chatbot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chatbot_sessions(id),
  role text NOT NULL,
  body text NOT NULL,
  kb_matched boolean,
  reply_to_message_id uuid,
  answer_language text,
  privacy_blocked boolean,
  operation_id uuid,
  operation_payload_hash text
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id integer NOT NULL REFERENCES public.roles(id),
  UNIQUE (user_id, role_id)
);

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id),
  session_id uuid,
  withdrawal_id uuid,
  subject varchar(255) NOT NULL,
  body text NOT NULL,
  category varchar(20) NOT NULL DEFAULT 'general',
  classification_method text NOT NULL DEFAULT 'keyword',
  status varchar(20) NOT NULL DEFAULT 'open'
    CONSTRAINT support_tickets_status_check
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to uuid REFERENCES public.users(id),
  resolved_at timestamptz,
  reopened_at timestamptz,
  last_reply_at timestamptz,
  customer_last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_allow_all ON public.support_tickets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.support_ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.users(id),
  sender_role varchar(10) NOT NULL CHECK (sender_role IN ('customer', 'admin')),
  body text NOT NULL,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type varchar(50) NOT NULL,
  title varchar(255) NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ticket_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, user_id)
);

CREATE TABLE app_private.fixture_super_admins (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE FUNCTION app_private.is_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_private.fixture_super_admins
    WHERE user_id = p_user_id
  )
$$;

GRANT USAGE ON SCHEMA public, auth, app_private TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT EXECUTE ON FUNCTION extensions.digest(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_super_admin(uuid) TO service_role;
GRANT SELECT ON app_private.fixture_super_admins TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.users,
  public.roles,
  public.chatbot_sessions,
  public.chatbot_messages,
  public.user_roles,
  public.support_tickets,
  public.support_ticket_replies,
  public.notifications,
  public.ticket_mutes
TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

INSERT INTO public.users (id, email, full_name) VALUES
  ('00000000-0000-4000-8000-000000000001', 'customer@example.test', 'Customer'),
  ('00000000-0000-4000-8000-000000000002', 'admin@example.test', 'Admin'),
  ('00000000-0000-4000-8000-000000000003', 'other-customer@example.test', 'Other Customer'),
  ('00000000-0000-4000-8000-000000000004', 'second-admin@example.test', 'Second Admin'),
  ('00000000-0000-4000-8000-000000000005', 'staff@example.test', 'Staff');
INSERT INTO auth.users (id)
SELECT id FROM public.users;

INSERT INTO public.roles (name) VALUES ('super_admin');
INSERT INTO public.user_roles (user_id, role_id)
SELECT users.id, roles.id
  FROM public.users AS users
  CROSS JOIN public.roles AS roles
 WHERE users.id IN (
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000004'
 )
   AND roles.name = 'super_admin';
INSERT INTO app_private.fixture_super_admins (user_id) VALUES
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000004');

INSERT INTO public.support_tickets (id, user_id, subject, body, status, assigned_to) VALUES
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Reply case', 'Initial message', 'open', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Customer reply case', 'Initial message', 'open', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Reopen case', 'Initial message', 'resolved', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Closed case', 'Initial message', 'closed', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'Muted case', 'Initial message', 'open', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000003', 'Other customer case', 'Private message', 'open', '00000000-0000-4000-8000-000000000002');
INSERT INTO public.ticket_mutes (ticket_id, user_id)
VALUES ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001');

\ir ../migrations/20261111143000_support_ticket_operation_keys.sql
\ir ../migrations/20261111153000_support_reply_operation_keys.sql
\ir ../migrations/20261111160000_commit_support_ticket_reply_atomically.sql
\ir ../migrations/20261111161000_commit_support_ticket_reopen_atomically.sql
\ir ../migrations/20261111163000_support_attachment_lifecycle.sql
\ir ../migrations/20261111164000_commit_support_ticket_attachment_atomically.sql
\ir ../migrations/20261111165000_support_attachment_retry_recovery.sql
\ir ../migrations/20261111212000_support_attachment_upload_reconciliation.sql
\ir ../migrations/20261111220000_support_operation_ledger.sql
\ir ../migrations/20261112093302_support_ticket_reopen_operation_idempotency.sql
\ir ../migrations/20261112100000_support_ticket_attachment_bucket.sql
\ir ../migrations/20261111192000_support_handoff_tokens.sql
\ir ../migrations/20261111210000_support_handoff_consent_and_private_chat_reads.sql
\ir ../migrations/20261112134833_support_handoff_sanitized_message_snapshot.sql

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.commit_support_ticket_reply(uuid,uuid,text,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.commit_support_ticket_reply(uuid,uuid,text,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reopen_support_ticket(uuid,uuid,uuid,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reopen_support_ticket(uuid,uuid,uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'public roles can execute a service-only support ticket RPC';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.commit_support_ticket_reply(uuid,uuid,text,text,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.reopen_support_ticket(uuid,uuid,uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service role cannot execute a support ticket RPC';
  END IF;
  IF has_column_privilege('authenticated', 'public.support_tickets', 'handoff_source_message', 'SELECT')
     OR has_column_privilege('authenticated', 'public.support_tickets', 'handoff_source_message_sanitized', 'SELECT')
     OR has_column_privilege('authenticated', 'public.support_tickets', 'operation_payload_hash', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated clients can select internal handoff or operation columns';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.support_tickets', 'user_id', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.support_tickets', 'subject', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.support_tickets', 'customer_last_read_at', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated customer list reads lost a required column grant';
  END IF;
  IF has_column_privilege('anon', 'public.support_tickets', 'subject', 'SELECT') THEN
    RAISE EXCEPTION 'anonymous clients can select support tickets';
  END IF;
  IF EXISTS (
       SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'support_tickets'
          AND policyname IN ('demo_allow_all', 'support_own_or_admin')
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'support_tickets'
          AND policyname = 'support_customer_read'
          AND cmd = 'SELECT'
          AND qual LIKE '%auth.uid()%user_id%'
     ) THEN
    RAISE EXCEPTION 'support ticket RLS is not owner-scoped';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_owned_count integer;
  v_other_count integer;
BEGIN
  SELECT count(*) INTO v_owned_count
    FROM public.support_tickets
   WHERE id = '10000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO v_other_count
    FROM public.support_tickets
   WHERE id = '10000000-0000-4000-8000-000000000008';
  IF v_owned_count <> 1 OR v_other_count <> 0 THEN
    RAISE EXCEPTION 'authenticated customer RLS does not scope ticket rows to the owner';
  END IF;
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_customer uuid := '00000000-0000-4000-8000-000000000001';
  v_admin uuid := '00000000-0000-4000-8000-000000000002';
  v_other_customer uuid := '00000000-0000-4000-8000-000000000003';
  v_non_admin uuid := '00000000-0000-4000-8000-000000000005';
  v_reply_operation uuid := '20000000-0000-4000-8000-000000000001';
  v_customer_operation uuid := '20000000-0000-4000-8000-000000000002';
  v_muted_operation uuid := '20000000-0000-4000-8000-000000000003';
  v_second_reopen_operation uuid := '20000000-0000-4000-8000-000000000004';
  v_noop_reopen_operation uuid := '20000000-0000-4000-8000-000000000005';
  v_reopen_hash text := repeat('9', 64);
  v_result jsonb;
  v_replay jsonb;
  v_reopen jsonb;
  v_reopen_retry jsonb;
  v_reply_id uuid;
  v_reopen_time timestamptz;
  v_reservation jsonb;
  v_lease_token uuid;
  v_conflict boolean := false;
  v_locked boolean := false;
  v_forbidden boolean := false;
  v_unauthorized_admin boolean := false;
BEGIN
  v_result := public.commit_support_ticket_reply(
    '10000000-0000-4000-8000-000000000001', v_admin, 'admin',
    'We are checking this for you.', v_reply_operation, repeat('a', 64)
  );
  v_reply_id := (v_result->>'id')::uuid;
  IF v_result->>'created' <> 'true' OR v_result->>'new_status' <> 'in_progress' THEN
    RAISE EXCEPTION 'admin reply did not create a reply and move the ticket to in_progress: %', v_result;
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_customer AND type = 'support_reply') <> 1 THEN
    RAISE EXCEPTION 'admin reply did not create exactly one customer notification';
  END IF;

  v_replay := public.commit_support_ticket_reply(
    '10000000-0000-4000-8000-000000000001', v_admin, 'admin',
    'We are checking this for you.', v_reply_operation, repeat('a', 64)
  );
  IF v_replay->>'created' <> 'false' OR (v_replay->>'id')::uuid <> v_reply_id THEN
    RAISE EXCEPTION 'reply retry did not return the original reply: %', v_replay;
  END IF;
  IF (SELECT count(*) FROM public.support_ticket_replies WHERE ticket_id = '10000000-0000-4000-8000-000000000001') <> 1
     OR (SELECT count(*) FROM public.notifications WHERE user_id = v_customer AND type = 'support_reply') <> 1 THEN
    RAISE EXCEPTION 'reply retry created a duplicate reply or notification';
  END IF;

  BEGIN
    PERFORM public.commit_support_ticket_reply(
      '10000000-0000-4000-8000-000000000001', v_admin, 'admin',
      'Different message', v_reply_operation, repeat('b', 64)
    );
  EXCEPTION WHEN OTHERS THEN
    v_conflict := SQLERRM = 'support_ticket_operation_conflict';
  END;
  IF NOT v_conflict THEN RAISE EXCEPTION 'same reply operation accepted a changed payload'; END IF;

  v_result := public.commit_support_ticket_reply(
    '10000000-0000-4000-8000-000000000002', v_customer, 'customer',
    'Here is more detail.', v_customer_operation, repeat('c', 64)
  );
  IF v_result->>'created' <> 'true' OR v_result->>'new_status' <> 'open' THEN
    RAISE EXCEPTION 'customer reply unexpectedly changed ticket status: %', v_result;
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_admin AND type = 'support_reply') <> 1 THEN
    RAISE EXCEPTION 'customer reply did not notify the assigned super admin once';
  END IF;

  v_result := public.commit_support_ticket_reply(
    '10000000-0000-4000-8000-000000000005', v_admin, 'admin',
    'This is a muted customer notice.', v_muted_operation, repeat('d', 64)
  );
  IF v_result->>'created' <> 'true'
     OR EXISTS (SELECT 1 FROM public.notifications WHERE link = '/customer/support/10000000-0000-4000-8000-000000000005') THEN
    RAISE EXCEPTION 'muted customer received an admin reply notification';
  END IF;

  BEGIN
    PERFORM public.commit_support_ticket_reply(
      '10000000-0000-4000-8000-000000000004', v_customer, 'customer',
      'A reply after closure.', gen_random_uuid(), repeat('e', 64)
    );
  EXCEPTION WHEN OTHERS THEN
    v_locked := SQLERRM = 'support_ticket_locked';
  END;
  IF NOT v_locked THEN RAISE EXCEPTION 'customer reply to a closed ticket was accepted'; END IF;

  BEGIN
    PERFORM public.commit_support_ticket_reply(
      '10000000-0000-4000-8000-000000000001', v_other_customer, 'customer',
      'Not my ticket.', gen_random_uuid(), repeat('f', 64)
    );
  EXCEPTION WHEN OTHERS THEN
    v_forbidden := SQLERRM = 'support_ticket_forbidden';
  END;
  IF NOT v_forbidden THEN RAISE EXCEPTION 'non-owner customer replied to another ticket'; END IF;

  BEGIN
    PERFORM public.commit_support_ticket_reply(
      '10000000-0000-4000-8000-000000000001', v_non_admin, 'admin',
      'Unauthorized admin reply.', gen_random_uuid(), repeat('1', 64)
    );
  EXCEPTION WHEN OTHERS THEN
    v_unauthorized_admin := SQLERRM = 'support_ticket_forbidden';
  END;
  IF NOT v_unauthorized_admin THEN RAISE EXCEPTION 'non-super-admin replied as admin'; END IF;

  v_reservation := public.reserve_support_operation(
    '20000000-0000-4000-8000-000000000004', 'user:' || v_customer::text,
    v_customer, NULL, 'reopen', v_reopen_hash, 120
  );
  v_lease_token := (v_reservation->>'leaseToken')::uuid;
  v_reopen := public.reopen_support_ticket(
    v_second_reopen_operation, '10000000-0000-4000-8000-000000000003',
    v_customer, v_reopen_hash, v_lease_token
  );
  IF v_reopen->>'changed' <> 'true' OR v_reopen->>'status' <> 'in_progress' THEN
    RAISE EXCEPTION 'resolved ticket did not reopen: %', v_reopen;
  END IF;
  SELECT reopened_at INTO v_reopen_time FROM public.support_tickets
   WHERE id = '10000000-0000-4000-8000-000000000003';
  IF v_reopen_time IS NULL OR (SELECT count(*) FROM public.notifications WHERE link = '/admin/support?ticket=10000000-0000-4000-8000-000000000003') <> 1 THEN
    RAISE EXCEPTION 'reopen did not store reopened_at and create exactly one staff notice';
  END IF;

  -- A later close must not make a retry of the first intent execute again.
  UPDATE public.support_tickets
     SET status = 'closed', resolved_at = now()
   WHERE id = '10000000-0000-4000-8000-000000000003';
  v_reservation := public.reserve_support_operation(
    v_second_reopen_operation, 'user:' || v_customer::text,
    v_customer, NULL, 'reopen', v_reopen_hash, 120
  );
  IF v_reservation->>'state' <> 'completed' OR v_reservation->>'shouldExecute' <> 'false' THEN
    RAISE EXCEPTION 'completed reopen operation was not replayed from the ledger';
  END IF;
  v_reopen_retry := public.reopen_support_ticket(
    v_second_reopen_operation, '10000000-0000-4000-8000-000000000003',
    v_customer, v_reopen_hash, NULL
  );
  IF v_reopen_retry->>'replayed' <> 'true'
     OR v_reopen_retry->>'changed' <> 'true'
     OR v_reopen_retry->>'status' <> 'in_progress' THEN
    RAISE EXCEPTION 'reopen retry did not return its original result: %', v_reopen_retry;
  END IF;
  IF (SELECT status FROM public.support_tickets WHERE id = '10000000-0000-4000-8000-000000000003') <> 'closed'
     OR (SELECT reopened_at FROM public.support_tickets WHERE id = '10000000-0000-4000-8000-000000000003') IS DISTINCT FROM v_reopen_time
     OR (SELECT count(*) FROM public.notifications WHERE link = '/admin/support?ticket=10000000-0000-4000-8000-000000000003') <> 1 THEN
    RAISE EXCEPTION 'replayed reopen changed current state or duplicated a notification';
  END IF;

  -- A deliberate later reopen uses a new operation ID and can create a new
  -- state transition and notification after the ticket was closed again.
  v_reservation := public.reserve_support_operation(
    v_noop_reopen_operation, 'user:' || v_customer::text,
    v_customer, NULL, 'reopen', v_reopen_hash, 120
  );
  v_reopen := public.reopen_support_ticket(
    v_noop_reopen_operation, '10000000-0000-4000-8000-000000000003',
    v_customer, v_reopen_hash, (v_reservation->>'leaseToken')::uuid
  );
  IF v_reopen->>'changed' <> 'true'
     OR (SELECT count(*) FROM public.notifications WHERE link = '/admin/support?ticket=' || '10000000-0000-4000-8000-000000000003') <> 2 THEN
    RAISE EXCEPTION 'a new reopen intent did not create its own transition and notice';
  END IF;

  v_reservation := public.reserve_support_operation(
    '20000000-0000-4000-8000-000000000006', 'user:' || v_customer::text,
    v_customer, NULL, 'reopen', v_reopen_hash, 120
  );
  v_reopen_retry := public.reopen_support_ticket(
    '20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000003',
    v_customer, v_reopen_hash, (v_reservation->>'leaseToken')::uuid
  );
  IF v_reopen_retry->>'changed' <> 'false' THEN
    RAISE EXCEPTION 'reopen of a ticket already in progress was not stored as a no-op';
  END IF;

  v_forbidden := false;
  BEGIN
    v_reservation := public.reserve_support_operation(
      '20000000-0000-4000-8000-000000000007', 'user:' || v_other_customer::text,
      v_other_customer, NULL, 'reopen', v_reopen_hash, 120
    );
    PERFORM public.reopen_support_ticket(
      '20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000003',
      v_other_customer, v_reopen_hash, (v_reservation->>'leaseToken')::uuid
    );
  EXCEPTION WHEN OTHERS THEN
    v_forbidden := SQLERRM = 'support_ticket_forbidden';
  END;
  IF NOT v_forbidden THEN RAISE EXCEPTION 'non-owner reopened another customer ticket'; END IF;

  RAISE NOTICE 'Support reply/reopen fixture passed: reply replay, reopen replay after an intervening close, new reopen intent, ownership, status transition, mute, and notification behavior.';
END;
$$;

DO $$
DECLARE
  v_ticket_id uuid;
  v_category text;
  v_created boolean;
  v_replay_created boolean;
  v_replay_ticket_id uuid;
  v_legacy_rejected boolean := false;
  v_raw_message text := 'My IC number is 990101-14-5678';
  v_safe_message text := 'My IC number is [IC]';
  v_source_message_id uuid := '50000000-0000-4000-8000-000000000001';
  v_session_id uuid := '50000000-0000-4000-8000-000000000002';
  v_handoff_token_hash text := repeat('c', 64);
  v_content_hash text := repeat('d', 64);
  v_operation_id uuid := '50000000-0000-4000-8000-000000000003';
  v_operation_hash text := repeat('e', 64);
BEGIN
  INSERT INTO public.chatbot_sessions (id, user_id, session_key, channel)
  VALUES (v_session_id, '00000000-0000-4000-8000-000000000001', 'fixture-customer-session', 'customer');
  INSERT INTO public.chatbot_messages (id, session_id, role, body)
  VALUES (v_source_message_id, v_session_id, 'user', v_raw_message);
  INSERT INTO public.support_handoff_tokens (
    token_hash, owner_id, content_hash, source_session_id, source_user_message_id,
    source_message_hash, source_message_snapshot, expires_at
  ) VALUES (
    v_handoff_token_hash,
    '00000000-0000-4000-8000-000000000001',
    v_content_hash,
    v_session_id,
    v_source_message_id,
    encode(extensions.digest(v_raw_message, 'sha256'), 'hex'),
    v_safe_message,
    now() + interval '15 minutes'
  );

  SELECT ticket_id, category, created
    INTO v_ticket_id, v_category, v_created
    FROM public.create_support_ticket_from_handoff(
      '00000000-0000-4000-8000-000000000001',
      v_operation_id,
      v_operation_hash,
      v_handoff_token_hash,
      v_content_hash,
      v_source_message_id,
      'Question',
      'Please help.',
      'general'
    );
  IF NOT v_created OR v_category <> 'general' THEN
    RAISE EXCEPTION 'sanitized handoff did not create a ticket';
  END IF;
  IF (SELECT handoff_source_message FROM public.support_tickets WHERE id = v_ticket_id) <> v_safe_message
     OR (SELECT handoff_source_message_sanitized FROM public.support_tickets WHERE id = v_ticket_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'ticket did not store and mark the exact sanitized preview snapshot';
  END IF;
  IF (SELECT handoff_source_message FROM public.support_tickets WHERE id = v_ticket_id) = v_raw_message THEN
    RAISE EXCEPTION 'raw chat message was copied into the support ticket';
  END IF;

  SELECT ticket_id, created
    INTO v_replay_ticket_id, v_replay_created
    FROM public.create_support_ticket_from_handoff(
      '00000000-0000-4000-8000-000000000001',
      v_operation_id,
      v_operation_hash,
      v_handoff_token_hash,
      v_content_hash,
      v_source_message_id,
      'Question',
      'Please help.',
      'general'
    );
  IF v_replay_created OR v_replay_ticket_id <> v_ticket_id THEN
    RAISE EXCEPTION 'handoff retry did not return the original ticket';
  END IF;

  INSERT INTO public.support_handoff_tokens (
    token_hash, owner_id, content_hash, source_session_id, source_user_message_id,
    source_message_hash, expires_at
  ) VALUES (
    repeat('f', 64),
    '00000000-0000-4000-8000-000000000001',
    repeat('1', 64),
    v_session_id,
    v_source_message_id,
    encode(extensions.digest(v_raw_message, 'sha256'), 'hex'),
    now() + interval '15 minutes'
  );
  BEGIN
    PERFORM public.create_support_ticket_from_handoff(
      '00000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000004',
      repeat('2', 64),
      repeat('f', 64),
      repeat('1', 64),
      v_source_message_id,
      'Old preview',
      'Please help.',
      'general'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_legacy_rejected := SQLERRM = 'support_handoff_invalid';
  END;
  IF NOT v_legacy_rejected THEN
    RAISE EXCEPTION 'legacy token without a sanitized snapshot was accepted';
  END IF;

  RAISE NOTICE 'Sanitized handoff snapshot fixture passed: raw input stayed out of ticket storage, snapshot retry was idempotent, and old unsafe tokens were rejected.';
END;
$$;

ROLLBACK;

-- Requires the disposable database with the repository migrations applied.
-- All generated users, tickets and replies are transaction-local and rolled back.
BEGIN;
SET LOCAL statement_timeout = '90s';
SET LOCAL lock_timeout = '5s';
SELECT set_config('support_queue.admin_id', gen_random_uuid()::text, true);
SELECT set_config('support_queue.customer_id', gen_random_uuid()::text, true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE name = 'super_admin') THEN
    RAISE EXCEPTION 'fixture requires the seeded super_admin role';
  END IF;
END $$;

INSERT INTO public.users(id,email,full_name,status) VALUES
  (current_setting('support_queue.admin_id')::uuid,
   'support-queue-admin-'||current_setting('support_queue.admin_id')||'@example.invalid','Queue Admin','active'),
  (current_setting('support_queue.customer_id')::uuid,
   'support-queue-email-search-'||current_setting('support_queue.customer_id')||'@example.invalid',NULL,'active');
INSERT INTO public.user_roles(user_id,role_id)
SELECT current_setting('support_queue.admin_id')::uuid,id FROM public.roles WHERE name='super_admin';
INSERT INTO public.support_tickets(id,user_id,subject,body,category,status,assigned_to,created_at)
SELECT gen_random_uuid(),NULL,
       'support-queue-pagination-fixture '||lpad(n::text,5,'0'),'synthetic body','general',
       CASE WHEN n % 2 = 0 THEN 'resolved' ELSE 'open' END,
       CASE WHEN n=1 THEN current_setting('support_queue.admin_id')::uuid ELSE NULL END,
       now() - (n||' seconds')::interval
  FROM generate_series(1,1005) AS n;
INSERT INTO public.support_tickets(id,user_id,subject,body,category,status,assigned_to,created_at)
VALUES (gen_random_uuid(), current_setting('support_queue.customer_id')::uuid,
  'support-queue-pagination-fixture private-body-search', 'body-search-needle-private', 'payment', 'open',
  current_setting('support_queue.admin_id')::uuid, now() + interval '1 second');
INSERT INTO public.support_ticket_replies(ticket_id,sender_id,sender_role,body,created_at)
SELECT id,current_setting('support_queue.admin_id')::uuid,'admin','first reply',created_at + interval '1 minute'
  FROM public.support_tickets WHERE subject='support-queue-pagination-fixture 00001';
INSERT INTO public.support_ticket_replies(ticket_id,sender_id,sender_role,body,created_at)
SELECT id,current_setting('support_queue.customer_id')::uuid,'customer','customer reply',now()
  FROM public.support_tickets WHERE subject='support-queue-pagination-fixture private-body-search';

SELECT set_config('request.jwt.claim.sub',current_setting('support_queue.admin_id'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object(
  'sub',current_setting('support_queue.admin_id'),'role','authenticated','aal','aal2','is_anonymous',false)::text,true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE support_queue_seen_ids(id uuid PRIMARY KEY) ON COMMIT DROP;

DO $$
DECLARE
  v_response jsonb;
  v_stats jsonb;
  v_ticket jsonb;
  v_page integer;
BEGIN
  FOR v_page IN 1..101 LOOP
    v_response := public.get_admin_support_queue(v_page,'all','all',false,false,'support-queue-pagination-fixture','default');
    IF (v_response->>'total')::integer <> 1006 OR (v_response->>'pageSize')::integer <> 10 THEN
      RAISE EXCEPTION 'incorrect queue count or page size';
    END IF;
    IF (v_page < 101 AND jsonb_array_length(v_response->'tickets') <> 10)
      OR (v_page = 101 AND jsonb_array_length(v_response->'tickets') <> 6) THEN
      RAISE EXCEPTION 'incorrect page length on page %',v_page;
    END IF;
    INSERT INTO support_queue_seen_ids(id)
      SELECT (row->>'id')::uuid FROM jsonb_array_elements(v_response->'tickets') AS row;
  END LOOP;
  IF (SELECT count(*) FROM support_queue_seen_ids) <> 1006 THEN
    RAISE EXCEPTION 'paginated queue has duplicates or missing tickets';
  END IF;

  v_response := public.get_admin_support_queue(1,'payment','open',true,true,'body-search-needle-private','default');
  IF (v_response->>'total')::integer <> 1 THEN RAISE EXCEPTION 'filters or body search did not match exactly one ticket'; END IF;
  v_ticket := v_response->'tickets'->0;
  IF v_ticket ? 'body' OR v_ticket ? 'email' OR v_ticket ? 'sessionId' OR v_ticket ? 'userId' THEN
    RAISE EXCEPTION 'queue response contains private or unused fields';
  END IF;
  IF v_ticket->>'userName' IS NOT NULL THEN RAISE EXCEPTION 'email fallback was exposed as display name'; END IF;
  v_stats := v_response->'stats';
  IF v_stats->>'open' <> (SELECT count(*)::text FROM public.support_tickets WHERE status='open')
     OR v_stats->>'unanswered' <> (SELECT count(*)::text FROM public.support_tickets ticket WHERE NOT EXISTS (
       SELECT 1 FROM public.support_ticket_replies reply WHERE reply.ticket_id=ticket.id AND reply.sender_role='admin'
     ))
     OR (v_stats->>'avgFirstResponseHours') IS NULL THEN
    RAISE EXCEPTION 'global queue statistics changed with list filters or are incomplete';
  END IF;

  v_response := public.get_admin_support_queue(1,'all','all',false,true,'support-queue-pagination-fixture','default');
  IF (v_response->>'total')::integer <> 1 THEN RAISE EXCEPTION 'unread filter did not preserve admin read semantics'; END IF;
  v_response := public.get_admin_support_queue(1,'all','all',true,false,'support-queue-pagination-fixture','default');
  IF (v_response->>'total')::integer <> 2 THEN RAISE EXCEPTION 'mine filter returned unexpected tickets'; END IF;

  v_response := public.get_admin_support_queue(1,'all','all',false,false,'support-queue-email-search','default');
  IF (v_response->>'total')::integer <> 1 THEN RAISE EXCEPTION 'email search should only match its requester'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',current_setting('support_queue.customer_id'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object(
  'sub',current_setting('support_queue.customer_id'),'role','authenticated','aal','aal2','is_anonymous',false)::text,true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.get_admin_support_queue(1,'all','all',false,false,'','default');
    RAISE EXCEPTION 'non-admin queue access was allowed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'support_ticket_permission_required' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege('anon','public.get_admin_support_queue(integer,text,text,boolean,boolean,text,text)','EXECUTE')
     OR has_function_privilege('service_role','public.get_admin_support_queue(integer,text,text,boolean,boolean,text,text)','EXECUTE')
     OR has_function_privilege('anon','app_private.get_admin_support_queue(integer,text,text,boolean,boolean,text,text)','EXECUTE')
     OR has_function_privilege('service_role','app_private.get_admin_support_queue(integer,text,text,boolean,boolean,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'queue RPC has an unexpected anon/service_role grant';
  END IF;
  IF NOT has_function_privilege('authenticated','public.get_admin_support_queue(integer,text,text,boolean,boolean,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated wrapper grant is missing';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: 1,006-ticket pagination, body-only and email search, filtered totals, global stats, role boundary and projection privacy; fixtures rolled back' AS result;

-- Run only after support_ticket_transactions_local.sql has installed the
-- migrations in a disposable local PostgreSQL database. This transaction
-- validates database state transitions; it does not emulate Storage bytes.
\set ON_ERROR_STOP on

BEGIN;
UPDATE storage.buckets
   SET public = true,
       file_size_limit = 1,
       allowed_mime_types = ARRAY['text/plain']
 WHERE id = 'ticket-attachments';
\ir ../migrations/20261112100000_support_ticket_attachment_bucket.sql

DO $bucket$
BEGIN
  IF (SELECT count(*) FROM storage.buckets WHERE id = 'ticket-attachments') <> 1
     OR (SELECT public FROM storage.buckets WHERE id = 'ticket-attachments') IS DISTINCT FROM false
     OR (SELECT file_size_limit FROM storage.buckets WHERE id = 'ticket-attachments') IS DISTINCT FROM 10485760::bigint
     OR (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'ticket-attachments')
          IS DISTINCT FROM ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[] THEN
    RAISE EXCEPTION 'attachment bucket migration did not restore its private limits';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname IN ('ticket_attachments_select', 'ticket_attachments_insert')
  ) THEN
    RAISE EXCEPTION 'legacy browser access policies remain on attachment objects';
  END IF;
END;
$bucket$;

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;

DO $fixture$
DECLARE
  v_ticket_id uuid := '10000000-0000-4000-8000-000000000001';
  v_customer_id uuid := '00000000-0000-4000-8000-000000000001';
  v_bound_operation_id uuid := '41000000-0000-4000-8000-000000000001';
  v_cleanup_operation_id uuid := '41000000-0000-4000-8000-000000000002';
  v_payload_hash text := repeat('a', 64);
  v_file_hash text := repeat('b', 64);
  v_reserved jsonb;
  v_committed jsonb;
  v_replay jsonb;
  v_cleanup jsonb;
  v_finished jsonb;
  v_retry jsonb;
  v_path text;
  v_retry_path text;
  v_lease uuid;
  v_cleanup_token uuid;
  v_upload_id uuid;
  v_state text;
  v_conflict boolean := false;
  v_invalid boolean := false;
  v_forbidden boolean := false;
  v_attachment_rpc_count integer;
  v_service_role_rpc_count integer;
BEGIN
  SELECT count(*)::integer,
         count(*) FILTER (WHERE has_function_privilege('service_role', proc.oid, 'EXECUTE'))::integer
    INTO v_attachment_rpc_count, v_service_role_rpc_count
    FROM pg_proc AS proc
    JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
   WHERE namespace.nspname = 'public'
     AND proc.proname = ANY(ARRAY[
       'reserve_support_attachment',
       'mark_support_attachment_started',
       'mark_support_attachment_uploaded',
       'abandon_support_attachment',
       'claim_support_attachment_cleanup',
       'finish_support_attachment_cleanup',
       'commit_support_ticket_attachment',
       'retry_support_attachment',
       'claim_support_attachment_reconciliation',
       'finish_support_attachment_reconciliation'
     ]);
  IF v_attachment_rpc_count <> 10 OR v_service_role_rpc_count <> 10 THEN
    RAISE EXCEPTION 'service role cannot execute every attachment RPC (% of %)',
      v_service_role_rpc_count, v_attachment_rpc_count;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS proc
      JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
     WHERE namespace.nspname = 'public'
       AND proc.proname = ANY(ARRAY[
         'reserve_support_attachment',
         'mark_support_attachment_started',
         'mark_support_attachment_uploaded',
         'abandon_support_attachment',
         'claim_support_attachment_cleanup',
         'finish_support_attachment_cleanup',
         'commit_support_ticket_attachment',
         'retry_support_attachment',
         'claim_support_attachment_reconciliation',
         'finish_support_attachment_reconciliation'
       ])
       AND (
         has_function_privilege('anon', proc.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', proc.oid, 'EXECUTE')
       )
  ) OR EXISTS (
    SELECT 1
      FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privilege_name
     WHERE has_table_privilege('anon', 'public.support_attachment_uploads', privilege_name)
        OR has_table_privilege('authenticated', 'public.support_attachment_uploads', privilege_name)
  ) OR has_column_privilege('anon', 'public.support_ticket_replies', 'attachment_url', 'SELECT')
     OR has_column_privilege('authenticated', 'public.support_ticket_replies', 'attachment_url', 'SELECT') THEN
    RAISE EXCEPTION 'browser role can access a private attachment table, RPC, or path column';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.support_attachment_uploads', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.support_attachment_uploads', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.support_attachment_uploads', 'UPDATE') THEN
    RAISE EXCEPTION 'service role cannot maintain the attachment upload manifest';
  END IF;

  BEGIN
    PERFORM public.reserve_support_attachment(
      '41000000-0000-4000-8000-000000000099', v_ticket_id, v_customer_id, 'customer',
      repeat('9', 64), v_file_hash, 'application/pdf', 10485761
    );
  EXCEPTION WHEN OTHERS THEN
    v_invalid := SQLERRM = 'support_ticket_invalid_attachment';
  END;
  IF NOT v_invalid THEN RAISE EXCEPTION 'oversized attachment was accepted by the database boundary'; END IF;

  BEGIN
    PERFORM public.reserve_support_attachment(
      '41000000-0000-4000-8000-000000000098', v_ticket_id,
      '00000000-0000-4000-8000-000000000003', 'customer',
      repeat('8', 64), v_file_hash, 'application/pdf', 12
    );
  EXCEPTION WHEN OTHERS THEN
    v_forbidden := SQLERRM = 'support_ticket_forbidden';
  END;
  IF NOT v_forbidden THEN RAISE EXCEPTION 'non-owner reserved an attachment for another ticket'; END IF;

  v_reserved := public.reserve_support_attachment(
    v_bound_operation_id, v_ticket_id, v_customer_id, 'customer',
    v_payload_hash, v_file_hash, 'application/pdf', 12
  );
  IF v_reserved->>'state' <> 'reserved' THEN
    RAISE EXCEPTION 'new attachment was not reserved: %', v_reserved;
  END IF;
  v_path := v_reserved->>'storage_path';
  v_lease := (v_reserved->>'lease_token')::uuid;
  IF v_path !~ ('^' || v_ticket_id::text || '/[0-9a-f-]{36}[.]pdf$') THEN
    RAISE EXCEPTION 'attachment path did not use its fixed ticket and UUID shape';
  END IF;
  SELECT id INTO v_upload_id FROM public.support_attachment_uploads
   WHERE operation_id = v_bound_operation_id;
  IF v_upload_id IS NULL THEN RAISE EXCEPTION 'attachment reservation was not persisted'; END IF;

  PERFORM public.mark_support_attachment_started(v_bound_operation_id, v_customer_id, v_lease);
  PERFORM public.mark_support_attachment_uploaded(v_bound_operation_id, v_customer_id, v_lease);
  v_committed := public.commit_support_ticket_attachment(
    v_ticket_id, v_customer_id, 'customer', 'PDF attached',
    v_path, v_bound_operation_id, v_payload_hash, v_lease
  );
  IF v_committed->>'created' <> 'true' THEN
    RAISE EXCEPTION 'validated attachment was not atomically bound: %', v_committed;
  END IF;
  IF (SELECT state FROM public.support_attachment_uploads WHERE id = v_upload_id) <> 'bound'
     OR (SELECT attachment_url FROM public.support_ticket_replies WHERE operation_id = v_bound_operation_id) IS DISTINCT FROM v_path
     OR (SELECT count(*) FROM public.support_ticket_replies WHERE operation_id = v_bound_operation_id) <> 1 THEN
    RAISE EXCEPTION 'binding did not store exactly one reply and bound manifest';
  END IF;

  v_replay := public.commit_support_ticket_attachment(
    v_ticket_id, v_customer_id, 'customer', 'PDF attached',
    v_path, v_bound_operation_id, v_payload_hash, NULL
  );
  IF v_replay->>'created' <> 'false'
     OR v_replay->>'id' IS DISTINCT FROM v_committed->>'id'
     OR (SELECT count(*) FROM public.support_ticket_replies WHERE operation_id = v_bound_operation_id) <> 1
     OR (SELECT count(*) FROM public.notifications
          WHERE link = '/admin/support?ticket=' || v_ticket_id::text AND type = 'support_reply') <> 1 THEN
    RAISE EXCEPTION 'attachment replay did not return the original reply without duplicate work';
  END IF;

  BEGIN
    PERFORM public.reserve_support_attachment(
      v_bound_operation_id, v_ticket_id, v_customer_id, 'customer',
      repeat('c', 64), v_file_hash, 'application/pdf', 12
    );
  EXCEPTION WHEN OTHERS THEN
    v_conflict := SQLERRM = 'support_ticket_operation_conflict';
  END;
  IF NOT v_conflict THEN RAISE EXCEPTION 'attachment operation accepted a changed payload'; END IF;

  v_cleanup := public.claim_support_attachment_cleanup();
  IF jsonb_array_length(v_cleanup->'items') <> 0
     OR (SELECT state FROM public.support_attachment_uploads WHERE id = v_upload_id) <> 'bound' THEN
    RAISE EXCEPTION 'cleanup claimed a bound attachment';
  END IF;

  v_reserved := public.reserve_support_attachment(
    v_cleanup_operation_id, v_ticket_id, v_customer_id, 'customer',
    repeat('d', 64), repeat('e', 64), 'application/pdf', 12
  );
  SELECT id INTO v_upload_id FROM public.support_attachment_uploads
   WHERE operation_id = v_cleanup_operation_id;
  UPDATE public.support_attachment_uploads
     SET lease_expires_at = now() - interval '1 second'
   WHERE id = v_upload_id;

  v_cleanup := public.claim_support_attachment_cleanup();
  IF jsonb_array_length(v_cleanup->'items') <> 1
     OR (v_cleanup->'items'->0->>'id')::uuid IS DISTINCT FROM v_upload_id
     OR (v_cleanup->'items'->0->>'storage_path') IS DISTINCT FROM v_reserved->>'storage_path' THEN
    RAISE EXCEPTION 'cleanup did not claim the expired unstarted reservation';
  END IF;
  v_cleanup_token := (v_cleanup->>'token')::uuid;
  IF (SELECT state FROM public.support_attachment_uploads WHERE id = v_upload_id) <> 'deleting' THEN
    RAISE EXCEPTION 'cleanup did not mark the object deleting before removal';
  END IF;

  v_finished := public.finish_support_attachment_cleanup(v_cleanup_token, ARRAY[v_upload_id], ARRAY[]::uuid[]);
  IF (v_finished->>'deleted')::integer <> 1
     OR (SELECT state FROM public.support_attachment_uploads WHERE id = v_upload_id) <> 'deleted' THEN
    RAISE EXCEPTION 'confirmed removal did not finish the cleanup state';
  END IF;

  v_retry := public.retry_support_attachment(
    v_cleanup_operation_id, v_ticket_id, v_customer_id, 'customer',
    repeat('d', 64), repeat('e', 64), 'application/pdf', 12
  );
  v_retry_path := v_retry->>'storage_path';
  IF v_retry->>'state' <> 'reserved' OR v_retry_path IS NOT DISTINCT FROM v_reserved->>'storage_path' THEN
    RAISE EXCEPTION 'retry reused a previously deleted object path: %', v_retry;
  END IF;

  UPDATE public.support_attachment_uploads
     SET lease_expires_at = now() - interval '1 second'
   WHERE id = v_upload_id;
  v_cleanup := public.claim_support_attachment_cleanup();
  v_cleanup_token := (v_cleanup->>'token')::uuid;
  v_finished := public.finish_support_attachment_cleanup(v_cleanup_token, ARRAY[]::uuid[], ARRAY[v_upload_id]);
  IF (v_finished->>'rescheduled')::integer <> 1
     OR (SELECT state FROM public.support_attachment_uploads WHERE id = v_upload_id) <> 'abandoned'
     OR (SELECT cleanup_attempts FROM public.support_attachment_uploads WHERE id = v_upload_id) <> 1
     OR (SELECT next_attempt_at <= now() FROM public.support_attachment_uploads WHERE id = v_upload_id) THEN
    RAISE EXCEPTION 'failed Storage removal was not bounded and rescheduled';
  END IF;
END;
$fixture$;

ROLLBACK;

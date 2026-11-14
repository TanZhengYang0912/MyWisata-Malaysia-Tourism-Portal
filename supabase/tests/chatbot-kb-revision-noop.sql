-- Run after all Support migrations against a disposable local Supabase/PostgreSQL database.
BEGIN;
SET LOCAL statement_timeout = '20s';

SELECT set_config('support_kb_noop.author_id', gen_random_uuid()::text, true);
SELECT set_config('support_kb_noop.document_id', gen_random_uuid()::text, true);
SELECT set_config('support_kb_noop.legacy_document_id', gen_random_uuid()::text, true);
SELECT set_config('support_kb_noop.blank_document_id', gen_random_uuid()::text, true);
INSERT INTO auth.users (id)
VALUES (current_setting('support_kb_noop.author_id')::uuid);
INSERT INTO public.users (id, email)
VALUES (current_setting('support_kb_noop.author_id')::uuid, 'support-kb-noop-' || current_setting('support_kb_noop.author_id') || '@example.test');
INSERT INTO public.user_roles (user_id, role_id)
SELECT current_setting('support_kb_noop.author_id')::uuid, roles.id
  FROM public.roles
 WHERE roles.name = 'super_admin';

INSERT INTO public.chatbot_kb_documents (
  id, title, body, keywords, category, is_active, content_version,
  embedding_version, published_source_refs, updated_at
)
VALUES (
  current_setting('support_kb_noop.document_id')::uuid,
  'Refund status', 'Check your account page.', ARRAY['refund'], 'payment', true, 7,
  7, '[{"url":"https://example.test/refunds"}]'::jsonb, '2026-01-01T00:00:00Z'
);
INSERT INTO public.chatbot_kb_documents (
  id, title, body, keywords, category, is_active, content_version,
  embedding_version, published_source_refs, updated_at
)
VALUES (
  current_setting('support_kb_noop.legacy_document_id')::uuid,
  'Legacy policy', 'Legacy body.', ARRAY['Refund', 'booking'], NULL, true, 2,
  2, '[{"url":"https://example.test/refunds"}]'::jsonb, '2026-01-02T00:00:00Z'
);
INSERT INTO public.chatbot_kb_documents (
  id, title, body, keywords, category, is_active, content_version,
  embedding_version, published_source_refs, updated_at
)
VALUES (
  current_setting('support_kb_noop.blank_document_id')::uuid,
  'Legacy keyword policy', 'Legacy keyword body.', ARRAY['refund', ''], 'general', true, 4,
  4, '[{"url":"https://example.test/refunds"}]'::jsonb, '2026-01-03T00:00:00Z'
);

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_author uuid := current_setting('support_kb_noop.author_id')::uuid;
  v_document uuid := current_setting('support_kb_noop.document_id')::uuid;
  v_legacy_document uuid := current_setting('support_kb_noop.legacy_document_id')::uuid;
  v_blank_document uuid := current_setting('support_kb_noop.blank_document_id')::uuid;
  v_sources jsonb := '[{"url":"https://example.test/refunds"}]'::jsonb;
  v_result jsonb;
  v_revision uuid;
BEGIN
  v_result := public.save_chatbot_kb_revision(
    v_document, v_author, 'Refund status', 'Check your account page.',
    ARRAY['refund'], 'payment', v_sources, 7, NULL
  );
  IF v_result->>'changed' <> 'false' OR v_result->>'revisionId' IS NOT NULL THEN
    RAISE EXCEPTION 'unchanged published source refs created a revision: %', v_result;
  END IF;
  IF (SELECT content_version FROM public.chatbot_kb_documents WHERE id = v_document) <> 7
     OR (SELECT embedding_version FROM public.chatbot_kb_documents WHERE id = v_document) <> 7
     OR (SELECT updated_at FROM public.chatbot_kb_documents WHERE id = v_document) <> '2026-01-01T00:00:00Z'::timestamptz
     OR EXISTS (SELECT 1 FROM public.chatbot_kb_revisions WHERE document_id = v_document) THEN
    RAISE EXCEPTION 'unchanged save wrote to the document or created a revision';
  END IF;

  v_result := public.save_chatbot_kb_revision(
    v_legacy_document, v_author, 'Legacy policy', 'Legacy body.',
    ARRAY['BOOKING', 'refund'], 'general', v_sources, 2, NULL
  );
  IF v_result->>'changed' <> 'false' OR v_result->>'revisionId' IS NOT NULL THEN
    RAISE EXCEPTION 'null category/default category and reordered keywords created a revision: %', v_result;
  END IF;
  IF (SELECT content_version FROM public.chatbot_kb_documents WHERE id = v_legacy_document) <> 2
     OR (SELECT embedding_version FROM public.chatbot_kb_documents WHERE id = v_legacy_document) <> 2
     OR (SELECT category FROM public.chatbot_kb_documents WHERE id = v_legacy_document) IS NOT NULL
     OR (SELECT updated_at FROM public.chatbot_kb_documents WHERE id = v_legacy_document) <> '2026-01-02T00:00:00Z'::timestamptz
     OR EXISTS (SELECT 1 FROM public.chatbot_kb_revisions WHERE document_id = v_legacy_document) THEN
    RAISE EXCEPTION 'normalized no-op modified the legacy document or created a revision';
  END IF;

  v_result := public.save_chatbot_kb_revision(
    v_legacy_document, v_author, 'Legacy policy', 'Legacy body updated.',
    ARRAY['BOOKING', 'refund'], 'general', v_sources, 2, NULL
  );
  v_revision := (v_result->>'revisionId')::uuid;
  IF v_result->>'changed' <> 'true' OR v_revision IS NULL THEN
    RAISE EXCEPTION 'a changed draft was not saved for review: %', v_result;
  END IF;
  UPDATE public.chatbot_kb_revisions SET updated_at = '2026-01-04T00:00:00Z' WHERE id = v_revision;
  v_result := public.save_chatbot_kb_revision(
    v_legacy_document, v_author, 'Legacy policy', 'Legacy body updated.',
    ARRAY['refund', 'BOOKING'], NULL, v_sources, 2, NULL
  );
  IF v_result->>'changed' <> 'false' OR v_result->>'revisionId' <> v_revision::text
     OR (SELECT updated_at FROM public.chatbot_kb_revisions WHERE id = v_revision) <> '2026-01-04T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'normalized unchanged draft caused a second update: %', v_result;
  END IF;

  v_result := public.save_chatbot_kb_revision(
    v_blank_document, v_author, 'Legacy keyword policy', 'Legacy keyword body.',
    ARRAY['refund'], 'general', v_sources, 4, NULL
  );
  v_revision := (v_result->>'revisionId')::uuid;
  IF v_result->>'changed' <> 'true' OR v_revision IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.chatbot_kb_revisions WHERE id = v_revision AND state = 'draft') THEN
    RAISE EXCEPTION 'removing an empty keyword skipped a real matcher change: %', v_result;
  END IF;
  IF (SELECT keywords FROM public.chatbot_kb_documents WHERE id = v_blank_document) <> ARRAY['refund', '']
     OR (SELECT published_source_refs FROM public.chatbot_kb_documents WHERE id = v_blank_document) <> v_sources
     OR (SELECT content_version FROM public.chatbot_kb_documents WHERE id = v_blank_document) <> 4 THEN
    RAISE EXCEPTION 'empty keyword removal bypassed review or changed published content';
  END IF;

  v_result := public.save_chatbot_kb_revision(
    v_document, v_author, 'Refund status', 'Check your account page.',
    ARRAY['refund'], 'payment', '[{"url":"https://example.test/new-refunds"}]'::jsonb, 7, NULL
  );
  v_revision := (v_result->>'revisionId')::uuid;
  IF v_result->>'changed' <> 'true' OR v_revision IS NULL THEN
    RAISE EXCEPTION 'changed source refs did not create a review revision: %', v_result;
  END IF;
  IF (SELECT source_refs FROM public.chatbot_kb_revisions WHERE id = v_revision)
       <> '[{"url":"https://example.test/new-refunds"}]'::jsonb
     OR (SELECT published_source_refs FROM public.chatbot_kb_documents WHERE id = v_document) <> v_sources
     OR (SELECT content_version FROM public.chatbot_kb_documents WHERE id = v_document) <> 7 THEN
    RAISE EXCEPTION 'changed sources were published without review';
  END IF;
END;
$$;
RESET ROLE;

ROLLBACK;

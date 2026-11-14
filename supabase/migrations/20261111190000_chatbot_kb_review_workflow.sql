CREATE TABLE public.chatbot_kb_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.chatbot_kb_documents(id) ON DELETE RESTRICT,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  title text NOT NULL,
  body text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  category text,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  revision_hash text NOT NULL,
  base_content_version bigint NOT NULL,
  creation_operation_id uuid UNIQUE,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'published', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(source_refs) = 'array')
);

CREATE UNIQUE INDEX chatbot_kb_one_open_revision_per_document
  ON public.chatbot_kb_revisions(document_id)
  WHERE state = 'draft';
CREATE INDEX chatbot_kb_revisions_document_created_idx
  ON public.chatbot_kb_revisions(document_id, created_at DESC, id DESC);

ALTER TABLE public.chatbot_kb_documents
  ADD COLUMN published_source_refs jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(published_source_refs) = 'array');

ALTER TABLE public.chatbot_kb_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chatbot_kb_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chatbot_kb_revisions TO service_role;

CREATE OR REPLACE FUNCTION public.claim_chatbot_kb_reindex(
  p_limit integer,
  p_lease_seconds integer,
  p_document_id uuid
) RETURNS TABLE(id uuid, title varchar, body text, content_version bigint, lease_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF auth.role() <> 'service_role' OR p_limit < 1 OR p_limit > 10 OR p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'invalid_reindex_claim';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT d.id FROM public.chatbot_kb_documents d
    WHERE d.is_active
      AND (p_document_id IS NULL OR d.id = p_document_id)
      AND d.embedding_version IS DISTINCT FROM d.content_version
      AND (d.index_lease_expires_at IS NULL OR d.index_lease_expires_at < clock_timestamp())
    ORDER BY d.updated_at, d.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE public.chatbot_kb_documents d
    SET index_lease_token = gen_random_uuid(),
        index_lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
    FROM candidates c WHERE d.id = c.id
    RETURNING d.id, d.title, d.body, d.content_version, d.index_lease_token
  )
  SELECT claimed.id, claimed.title, claimed.body, claimed.content_version, claimed.index_lease_token FROM claimed;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_chatbot_kb_reindex(integer, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_chatbot_kb_reindex(integer, integer, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.save_chatbot_kb_revision(
  p_document_id uuid,
  p_author_id uuid,
  p_title text,
  p_body text,
  p_keywords text[],
  p_category text,
  p_source_refs jsonb,
  p_expected_content_version bigint,
  p_operation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_document public.chatbot_kb_documents%ROWTYPE;
  v_revision public.chatbot_kb_revisions%ROWTYPE;
  v_document_id uuid := p_document_id;
  v_hash text;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_author_id IS NULL OR NOT coalesce(app_private.is_super_admin(p_author_id), false) THEN
    RAISE EXCEPTION 'chatbot_kb_author_super_admin_required';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' OR p_body IS NULL OR btrim(p_body) = ''
     OR p_expected_content_version IS NULL OR p_expected_content_version < 0
     OR p_source_refs IS NULL OR jsonb_typeof(p_source_refs) <> 'array' THEN
    RAISE EXCEPTION 'chatbot_kb_revision_invalid';
  END IF;

  v_hash := encode(extensions.digest(
    convert_to(btrim(p_title) || E'\n' || btrim(p_body) || E'\n' || array_to_string(coalesce(p_keywords, '{}'), E'\n') || E'\n' || coalesce(p_category, '') || E'\n' || p_source_refs::text, 'UTF8'),
    'sha256'
  ), 'hex');

  IF v_document_id IS NULL THEN
    IF p_operation_id IS NULL THEN RAISE EXCEPTION 'chatbot_kb_operation_required'; END IF;
    SELECT * INTO v_revision FROM public.chatbot_kb_revisions WHERE creation_operation_id = p_operation_id;
    IF FOUND THEN
      IF v_revision.revision_hash <> v_hash OR v_revision.author_id <> p_author_id THEN RAISE EXCEPTION 'chatbot_kb_revision_conflict'; END IF;
      RETURN jsonb_build_object('documentId', v_revision.document_id, 'revisionId', v_revision.id, 'changed', false, 'contentVersion', v_revision.base_content_version);
    END IF;
  END IF;

  IF v_document_id IS NULL THEN
    IF p_expected_content_version <> 0 THEN RAISE EXCEPTION 'chatbot_kb_revision_conflict'; END IF;
    INSERT INTO public.chatbot_kb_documents(title, body, keywords, category, is_active, content_version, embedding_version)
    VALUES (p_title, p_body, coalesce(p_keywords, '{}'), p_category, false, 0, NULL)
    RETURNING * INTO v_document;
    v_document_id := v_document.id;
  ELSE
    SELECT * INTO v_document FROM public.chatbot_kb_documents WHERE id = v_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'chatbot_kb_document_not_found'; END IF;
    IF v_document.content_version <> p_expected_content_version THEN RAISE EXCEPTION 'chatbot_kb_revision_conflict'; END IF;
  END IF;

  SELECT * INTO v_revision FROM public.chatbot_kb_revisions
    WHERE document_id = v_document_id AND state = 'draft' FOR UPDATE;
  IF NOT FOUND AND v_document.is_active
     AND v_document.title = btrim(p_title) AND v_document.body = btrim(p_body)
     AND coalesce(v_document.keywords, '{}') = coalesce(p_keywords, '{}')
     AND v_document.category IS NOT DISTINCT FROM p_category
     AND jsonb_array_length(p_source_refs) = 0 THEN
    RETURN jsonb_build_object('documentId', v_document_id, 'revisionId', NULL, 'changed', false, 'contentVersion', v_document.content_version);
  END IF;
  IF FOUND THEN
    IF v_revision.base_content_version <> v_document.content_version THEN RAISE EXCEPTION 'chatbot_kb_revision_conflict'; END IF;
    IF v_revision.title = btrim(p_title) AND v_revision.body = btrim(p_body)
       AND v_revision.keywords = coalesce(p_keywords, '{}') AND v_revision.category IS NOT DISTINCT FROM p_category
       AND v_revision.source_refs = p_source_refs AND v_revision.revision_hash = v_hash THEN
      RETURN jsonb_build_object('documentId', v_document_id, 'revisionId', v_revision.id, 'changed', false, 'contentVersion', v_document.content_version);
    END IF;
    UPDATE public.chatbot_kb_revisions
       SET title = btrim(p_title), body = btrim(p_body), keywords = coalesce(p_keywords, '{}'), category = p_category,
           source_refs = p_source_refs, revision_hash = v_hash, updated_at = now()
     WHERE id = v_revision.id RETURNING * INTO v_revision;
  ELSE
    INSERT INTO public.chatbot_kb_revisions(document_id, author_id, title, body, keywords, category, source_refs, revision_hash, base_content_version, creation_operation_id)
    VALUES (v_document_id, p_author_id, btrim(p_title), btrim(p_body), coalesce(p_keywords, '{}'), p_category, p_source_refs, v_hash, v_document.content_version, CASE WHEN p_document_id IS NULL THEN p_operation_id ELSE NULL END)
    RETURNING * INTO v_revision;
  END IF;
  RETURN jsonb_build_object('documentId', v_document_id, 'revisionId', v_revision.id, 'changed', true, 'contentVersion', v_document.content_version);
END;
$function$;

CREATE OR REPLACE FUNCTION public.publish_chatbot_kb_revision(
  p_document_id uuid,
  p_revision_id uuid,
  p_reviewer_id uuid,
  p_expected_content_version bigint,
  p_confirmed boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_revision public.chatbot_kb_revisions%ROWTYPE;
  v_document public.chatbot_kb_documents%ROWTYPE;
  v_document_id uuid;
  v_version bigint;
  v_content_changed boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_reviewer_id IS NULL OR NOT coalesce(app_private.is_super_admin(p_reviewer_id), false) THEN
    RAISE EXCEPTION 'chatbot_kb_reviewer_super_admin_required';
  END IF;
  IF p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'chatbot_kb_review_required'; END IF;
  SELECT document_id INTO v_document_id FROM public.chatbot_kb_revisions WHERE id = p_revision_id;
  IF NOT FOUND OR v_document_id <> p_document_id THEN RAISE EXCEPTION 'chatbot_kb_revision_not_found'; END IF;
  SELECT * INTO v_document FROM public.chatbot_kb_documents WHERE id = v_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'chatbot_kb_document_not_found'; END IF;
  SELECT * INTO v_revision FROM public.chatbot_kb_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'chatbot_kb_revision_not_found'; END IF;
  IF v_revision.document_id <> p_document_id THEN RAISE EXCEPTION 'chatbot_kb_revision_not_found'; END IF;
  IF v_revision.state = 'published' AND v_revision.reviewed_by IS NOT NULL THEN
    RETURN jsonb_build_object('documentId', v_document.id, 'contentVersion', v_document.content_version, 'published', true, 'changed', false);
  END IF;
  IF v_revision.state <> 'draft' THEN RAISE EXCEPTION 'chatbot_kb_revision_not_found'; END IF;
  IF v_revision.base_content_version <> p_expected_content_version OR v_document.content_version <> p_expected_content_version THEN
    RAISE EXCEPTION 'chatbot_kb_revision_conflict';
  END IF;
  IF jsonb_array_length(v_revision.source_refs) = 0 THEN RAISE EXCEPTION 'chatbot_kb_source_required'; END IF;
  IF (v_revision.title || E'\n' || v_revision.body) LIKE '%[ADMIN: confirm%' THEN RAISE EXCEPTION 'chatbot_kb_review_required'; END IF;

  v_content_changed := NOT v_document.is_active
    OR v_document.title IS DISTINCT FROM v_revision.title
    OR v_document.body IS DISTINCT FROM v_revision.body
    OR coalesce(v_document.keywords, '{}') IS DISTINCT FROM v_revision.keywords
    OR v_document.category IS DISTINCT FROM v_revision.category;
  v_version := v_document.content_version + CASE WHEN v_content_changed THEN 1 ELSE 0 END;
  UPDATE public.chatbot_kb_documents
     SET title = v_revision.title, body = v_revision.body, keywords = v_revision.keywords, category = v_revision.category,
         is_active = true,
         published_source_refs = v_revision.source_refs,
         content_version = v_version,
         embedding_version = CASE WHEN v_content_changed THEN NULL ELSE embedding_version END,
         updated_at = CASE WHEN v_content_changed THEN now() ELSE updated_at END
   WHERE id = v_document.id;
  UPDATE public.chatbot_kb_revisions SET state = 'published', reviewed_by = p_reviewer_id, reviewed_at = now(), updated_at = now()
   WHERE id = v_revision.id;
  RETURN jsonb_build_object('documentId', v_document.id, 'contentVersion', v_version, 'published', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_chatbot_kb_revision(uuid, uuid, text, text, text[], text, jsonb, bigint, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_chatbot_kb_revision(uuid, uuid, uuid, bigint, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_chatbot_kb_revision(uuid, uuid, text, text, text[], text, jsonb, bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_chatbot_kb_revision(uuid, uuid, uuid, bigint, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';

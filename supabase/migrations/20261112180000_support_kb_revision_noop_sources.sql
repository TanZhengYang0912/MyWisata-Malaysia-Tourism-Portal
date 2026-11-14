-- Preserve no-op behavior when an unchanged published article includes sources.
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
  v_document_keywords text[];
  v_revision_keywords text[];
  v_input_keywords text[];
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

  SELECT ARRAY(
    SELECT lower(btrim(keyword.value))
      FROM unnest(coalesce(p_keywords, ARRAY[]::text[])) AS keyword(value)
     ORDER BY lower(btrim(keyword.value))
  ) INTO v_input_keywords;

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

  SELECT ARRAY(
    SELECT lower(btrim(keyword.value))
      FROM unnest(coalesce(v_document.keywords, ARRAY[]::text[])) AS keyword(value)
     ORDER BY lower(btrim(keyword.value))
  ) INTO v_document_keywords;
  SELECT * INTO v_revision FROM public.chatbot_kb_revisions
    WHERE document_id = v_document_id AND state = 'draft' FOR UPDATE;
  IF NOT FOUND AND v_document.is_active
     AND v_document.title = btrim(p_title) AND v_document.body = btrim(p_body)
     AND v_document_keywords = v_input_keywords
     AND coalesce(nullif(btrim(v_document.category), ''), 'general') = coalesce(nullif(btrim(p_category), ''), 'general')
     AND p_source_refs = v_document.published_source_refs THEN
    RETURN jsonb_build_object('documentId', v_document_id, 'revisionId', NULL, 'changed', false, 'contentVersion', v_document.content_version);
  END IF;
  IF FOUND THEN
    IF v_revision.base_content_version <> v_document.content_version THEN RAISE EXCEPTION 'chatbot_kb_revision_conflict'; END IF;
    SELECT ARRAY(
      SELECT lower(btrim(keyword.value))
        FROM unnest(coalesce(v_revision.keywords, ARRAY[]::text[])) AS keyword(value)
       ORDER BY lower(btrim(keyword.value))
    ) INTO v_revision_keywords;
    IF v_revision.title = btrim(p_title) AND v_revision.body = btrim(p_body)
       AND v_revision_keywords = v_input_keywords
       AND coalesce(nullif(btrim(v_revision.category), ''), 'general') = coalesce(nullif(btrim(p_category), ''), 'general')
       AND v_revision.source_refs = p_source_refs THEN
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

REVOKE ALL ON FUNCTION public.save_chatbot_kb_revision(uuid, uuid, text, text, text[], text, jsonb, bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_chatbot_kb_revision(uuid, uuid, text, text, text[], text, jsonb, bigint, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

ALTER TABLE public.chatbot_kb_documents
  ADD COLUMN content_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN embedding_version bigint,
  ADD COLUMN index_lease_token uuid,
  ADD COLUMN index_lease_expires_at timestamptz;

-- Existing vectors are trusted only when their recorded embedding time is at
-- least as recent as the current document update.
UPDATE public.chatbot_kb_documents
SET embedding_version = CASE
  WHEN embedding IS NOT NULL AND embedded_at IS NOT NULL AND embedded_at >= updated_at THEN content_version
  ELSE NULL
END;

CREATE OR REPLACE FUNCTION public.claim_chatbot_kb_reindex(p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 300)
RETURNS TABLE(id uuid, title varchar, body text, content_version bigint, lease_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' OR p_limit < 1 OR p_limit > 10 OR p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'invalid_reindex_claim';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT d.id FROM public.chatbot_kb_documents d
    WHERE d.is_active
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
$$;

CREATE OR REPLACE FUNCTION public.finish_chatbot_kb_reindex(
  p_id uuid, p_content_version bigint, p_lease_token uuid, p_embedding extensions.vector(768)
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_updated_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  UPDATE public.chatbot_kb_documents
  SET embedding = p_embedding,
      embedded_at = clock_timestamp(),
      embedding_version = p_content_version,
      index_lease_token = NULL,
      index_lease_expires_at = NULL
  WHERE id = p_id AND content_version = p_content_version AND index_lease_token = p_lease_token;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_chatbot_kb_reindex(p_id uuid, p_lease_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_updated_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  UPDATE public.chatbot_kb_documents
  SET index_lease_token = NULL, index_lease_expires_at = NULL
  WHERE id = p_id AND index_lease_token = p_lease_token;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_kb_documents(query_embedding extensions.vector(768), match_count integer DEFAULT 3)
RETURNS TABLE (id uuid, title varchar, body text, category varchar, similarity numeric)
LANGUAGE sql STABLE
AS $$
  SELECT d.id, d.title, d.body, d.category, 1 - (d.embedding <=> query_embedding) AS similarity
  FROM public.chatbot_kb_documents d
  WHERE d.is_active = true AND d.embedding IS NOT NULL AND d.embedding_version = d.content_version
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION public.claim_chatbot_kb_reindex(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_chatbot_kb_reindex(uuid, bigint, uuid, extensions.vector) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_chatbot_kb_reindex(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_chatbot_kb_reindex(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_chatbot_kb_reindex(uuid, bigint, uuid, extensions.vector) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_chatbot_kb_reindex(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_kb_documents(extensions.vector, integer) TO authenticated, anon, service_role;

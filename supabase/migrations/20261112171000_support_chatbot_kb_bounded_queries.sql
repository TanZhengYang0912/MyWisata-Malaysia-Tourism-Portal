-- Keep public FAQ category counts aggregated in Postgres. The invoker still
-- sees only active documents allowed by the existing public read policy.
CREATE OR REPLACE FUNCTION public.list_support_faq_categories()
RETURNS TABLE(category text, question_count integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(document.category, 'general')::text, count(*)::integer
  FROM public.chatbot_kb_documents AS document
  WHERE document.is_active
  GROUP BY 1
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.list_support_faq_categories() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_support_faq_categories() TO anon, authenticated, service_role;

-- The previous application fallback loaded every active document, scored them
-- in Node, then discarded all but one match per question. Score the full active
-- set here and return at most ten ranked candidates per question so the
-- application can preserve its additional PII safety gate without a full read.
CREATE OR REPLACE FUNCTION public.search_support_kb_keywords(
  p_questions text[],
  p_reviewed_only boolean[] DEFAULT '{}'
)
RETURNS TABLE(
  question_index integer,
  id uuid,
  title text,
  body text,
  keywords text[],
  category text,
  content_version bigint,
  published_source_refs jsonb,
  score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF coalesce(cardinality(p_questions), 0) > 3
     OR EXISTS (SELECT 1 FROM unnest(coalesce(p_questions, '{}')) AS question(value) WHERE length(question.value) > 500) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_kb_keyword_query_invalid';
  END IF;

  RETURN QUERY
  WITH input_questions AS MATERIALIZED (
    SELECT ordinal::integer AS question_index,
      lower(btrim(regexp_replace(
        regexp_replace(coalesce(input.question, ''), '[^[:alnum:][:space:]]', ' ', 'g'),
        '[[:space:]]+', ' ', 'g'
      ))) AS normalized_question
    FROM unnest(coalesce(p_questions, '{}')) WITH ORDINALITY AS input(question, ordinal)
  ),
  question_words AS MATERIALIZED (
    SELECT input.question_index, word.value AS word
    FROM input_questions AS input
    CROSS JOIN LATERAL regexp_split_to_table(input.normalized_question, ' ') AS word(value)
    WHERE word.value <> ''
      AND word.value <> ALL (ARRAY[
        'a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being',
        'do', 'does', 'did', 'doing', 'done',
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
        'to', 'of', 'in', 'on', 'at', 'for', 'with', 'about', 'from', 'into', 'by', 'as',
        'and', 'or', 'but', 'if', 'so', 'than', 'that', 'this', 'these', 'those',
        'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might', 'must',
        'how', 'what', 'when', 'where', 'who', 'whom', 'which', 'why'
      ]::text[])
  ),
  scored AS (
    SELECT input.question_index, document.id, document.title::text, document.body,
      coalesce(document.keywords, '{}') AS keywords, document.category::text,
      document.content_version, document.published_source_refs,
      count(*) FILTER (WHERE CASE
        WHEN position(' ' IN lower(btrim(keyword.value))) > 0 THEN
          strpos(input.normalized_question, lower(btrim(keyword.value))) > 0
        ELSE EXISTS (
          SELECT 1 FROM question_words AS word
          WHERE word.question_index = input.question_index
            AND word.word = lower(btrim(keyword.value))
        )
      END)::numeric / cardinality(document.keywords) AS score
    FROM input_questions AS input
    JOIN public.chatbot_kb_documents AS document
      ON document.is_active
     AND (
       NOT coalesce(p_reviewed_only[input.question_index], false)
       OR (
         jsonb_typeof(document.published_source_refs) = 'array'
         AND jsonb_array_length(document.published_source_refs) > 0
       )
     )
    CROSS JOIN LATERAL unnest(coalesce(document.keywords, '{}')) AS keyword(value)
    WHERE cardinality(document.keywords) > 0
    GROUP BY input.question_index, input.normalized_question,
      document.id, document.title, document.body, document.keywords,
      document.category, document.content_version, document.published_source_refs
  ),
  ranked AS (
    SELECT scored.*, row_number() OVER (
      PARTITION BY scored.question_index ORDER BY scored.score DESC, scored.id ASC
    ) AS rank
    FROM scored
    WHERE scored.score >= 0.3
  )
  SELECT ranked.question_index, ranked.id, ranked.title, ranked.body,
    ranked.keywords, ranked.category, ranked.content_version,
    ranked.published_source_refs, ranked.score
  FROM ranked
  WHERE ranked.rank <= 10
  ORDER BY ranked.question_index, ranked.score DESC, ranked.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.search_support_kb_keywords(text[], boolean[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_support_kb_keywords(text[], boolean[]) TO service_role;

NOTIFY pgrst, 'reload schema';

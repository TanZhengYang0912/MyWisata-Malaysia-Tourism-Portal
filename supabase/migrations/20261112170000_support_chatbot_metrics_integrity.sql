-- Count user questions as the answer-rate denominator and only pair messages
-- inside the same customer session. Text is exposed only from turns written by
-- the server after its sanitization boundary; legacy turns remain countable.
ALTER TABLE public.chatbot_messages
  ADD COLUMN IF NOT EXISTS body_sanitized boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.chatbot_messages.body_sanitized IS
  'True only when the server stored this body after its sanitization boundary; false means provenance is unknown.';

CREATE OR REPLACE FUNCTION public.get_customer_chatbot_stats(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH customer_messages AS MATERIALIZED (
    SELECT m.id, m.session_id, m.role,
      CASE WHEN m.body_sanitized THEN m.body ELSE NULL END AS safe_body,
      m.kb_matched, m.reply_to_message_id, m.created_at
    FROM public.chatbot_messages m
    JOIN public.chatbot_sessions s ON s.id = m.session_id AND s.channel = 'customer'
    WHERE m.created_at >= p_from AND m.created_at < p_to
  ),
  question_outcomes AS (
    SELECT q.id, q.session_id, q.safe_body AS question, q.created_at AS asked_at,
      coalesce(bool_or(coalesce(bot.kb_matched, false)), false) AS answered,
      count(bot.id) > 0 AS has_paired_reply,
      max(bot.created_at) AS replied_at
    FROM customer_messages q
    LEFT JOIN public.chatbot_messages bot
      ON bot.reply_to_message_id = q.id
     AND bot.session_id = q.session_id
     AND bot.role = 'bot'
     AND bot.created_at < p_to
    WHERE q.role = 'user'
    GROUP BY q.id, q.session_id, q.safe_body, q.created_at
  ),
  common_questions AS (
    SELECT lower(regexp_replace(btrim(question), '[[:space:][:punct:]]+', '', 'g')) AS normalized,
      min(question) AS question, count(*)::integer AS count, max(asked_at) AS last_asked_at
    FROM question_outcomes
    WHERE nullif(btrim(question), '') IS NOT NULL
    GROUP BY 1
    ORDER BY count DESC, last_asked_at DESC
    LIMIT 10
  ),
  unanswered_top AS (
    SELECT lower(regexp_replace(btrim(question), '[[:space:][:punct:]]+', '', 'g')) AS normalized,
      min(question) AS question, count(*)::integer AS count,
      max(coalesce(replied_at, asked_at)) AS last_asked_at
    FROM question_outcomes
    WHERE NOT answered AND nullif(btrim(question), '') IS NOT NULL
    GROUP BY 1
    ORDER BY count DESC, last_asked_at DESC
    LIMIT 10
  ),
  feedback_rows AS MATERIALIZED (
    SELECT CASE WHEN question.body_sanitized THEN question.body ELSE NULL END AS question,
      f.bot_answered, f.helpful, f.opened_ticket, f.created_at
    FROM public.chatbot_feedback f
    JOIN public.chatbot_sessions s ON s.id = f.session_id AND s.channel = 'customer'
    JOIN public.chatbot_messages bot
      ON bot.id = f.message_id AND bot.session_id = f.session_id AND bot.role = 'bot'
    LEFT JOIN public.chatbot_messages question
      ON question.id = bot.reply_to_message_id
     AND question.session_id = bot.session_id
     AND question.role = 'user'
    WHERE f.created_at >= p_from AND f.created_at < p_to
  ),
  not_helpful_top AS (
    SELECT lower(regexp_replace(btrim(question), '[[:space:][:punct:]]+', '', 'g')) AS normalized,
      min(question) AS question, count(*)::integer AS count, max(created_at) AS last_asked_at
    FROM feedback_rows
    WHERE bot_answered AND helpful = false AND nullif(btrim(question), '') IS NOT NULL
    GROUP BY 1
    ORDER BY count DESC, last_asked_at DESC
    LIMIT 10
  ),
  escalated_top AS (
    SELECT lower(regexp_replace(btrim(question), '[[:space:][:punct:]]+', '', 'g')) AS normalized,
      min(question) AS question, count(*)::integer AS count, max(created_at) AS last_asked_at
    FROM feedback_rows
    WHERE opened_ticket AND (bot_answered = false OR helpful = false) AND nullif(btrim(question), '') IS NOT NULL
    GROUP BY 1
    ORDER BY count DESC, last_asked_at DESC
    LIMIT 10
  ),
  totals AS (
    SELECT
      (SELECT count(*)::integer FROM question_outcomes) AS total_questions,
      (SELECT count(*)::integer FROM question_outcomes WHERE answered) AS answered_count,
      (SELECT count(*)::integer FROM question_outcomes WHERE has_paired_reply AND NOT answered) AS paired_unanswered_count,
      (
        SELECT count(*)::integer
        FROM customer_messages bot
        WHERE bot.role = 'bot'
          AND NOT EXISTS (
            SELECT 1 FROM public.chatbot_messages question
            WHERE question.id = bot.reply_to_message_id
              AND question.session_id = bot.session_id
              AND question.role = 'user'
          )
      ) AS legacy_unpaired_count,
      (SELECT count(*)::integer FROM feedback_rows WHERE bot_answered = false OR helpful = false) AS failed_feedback_count,
      (SELECT count(*)::integer FROM feedback_rows WHERE (bot_answered = false OR helpful = false) AND opened_ticket) AS escalated_feedback_count
  )
  SELECT jsonb_build_object(
    'totalQuestions', totals.total_questions,
    'answeredCount', totals.answered_count,
    'answerRate', CASE WHEN totals.total_questions = 0 THEN 0 ELSE totals.answered_count::numeric / totals.total_questions END,
    'topCommon', coalesce((SELECT jsonb_agg(jsonb_build_object('question', question, 'count', count, 'lastAskedAt', last_asked_at) ORDER BY count DESC, last_asked_at DESC) FROM common_questions), '[]'::jsonb),
    'topUnanswered', coalesce((SELECT jsonb_agg(jsonb_build_object('question', question, 'count', count, 'lastAskedAt', last_asked_at) ORDER BY count DESC, last_asked_at DESC) FROM unanswered_top), '[]'::jsonb),
    'notHelpfulAnswered', coalesce((SELECT jsonb_agg(jsonb_build_object('question', question, 'count', count, 'lastAskedAt', last_asked_at) ORDER BY count DESC, last_asked_at DESC) FROM not_helpful_top), '[]'::jsonb),
    'escalationRate', CASE WHEN totals.failed_feedback_count = 0 THEN 0 ELSE totals.escalated_feedback_count::numeric / totals.failed_feedback_count END,
    'topEscalated', coalesce((SELECT jsonb_agg(jsonb_build_object('question', question, 'count', count, 'lastAskedAt', last_asked_at) ORDER BY count DESC, last_asked_at DESC) FROM escalated_top), '[]'::jsonb),
    'pairedUnansweredCount', totals.paired_unanswered_count,
    'legacyUnpairedCount', totals.legacy_unpaired_count,
    'range', jsonb_build_object('from', p_from, 'to', p_to)
  )
  FROM totals;
$$;

REVOKE ALL ON FUNCTION public.get_customer_chatbot_stats(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_chatbot_stats(timestamptz, timestamptz) TO service_role;

ALTER TABLE public.chatbot_feedback
  ADD COLUMN IF NOT EXISTS question_source_version smallint NOT NULL DEFAULT 0
    CHECK (question_source_version IN (0, 1));

CREATE INDEX IF NOT EXISTS chatbot_feedback_question_source_repair_idx
  ON public.chatbot_feedback (id)
  WHERE question_source_version = 0;

-- Repair customer feedback in small, resumable ID batches. Only a correctly
-- paired customer question can supply text; unpaired legacy echoes are erased.
CREATE OR REPLACE FUNCTION public.repair_chatbot_feedback_question_source(
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(next_cursor uuid, processed_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'chatbot_feedback_repair_invalid';
  END IF;

  RETURN QUERY
  WITH batch AS MATERIALIZED (
    SELECT feedback.id, feedback.message_id, feedback.session_id
    FROM public.chatbot_feedback AS feedback
    JOIN public.chatbot_sessions AS session
      ON session.id = feedback.session_id AND session.channel = 'customer'
    WHERE feedback.question_source_version = 0
      AND (p_after_id IS NULL OR feedback.id > p_after_id)
    ORDER BY feedback.id
    LIMIT p_limit
  ),
  source_questions AS MATERIALIZED (
    SELECT batch.id,
      CASE WHEN question.body_sanitized THEN question.body ELSE NULL END AS body
    FROM batch
    LEFT JOIN public.chatbot_messages AS bot
      ON bot.id = batch.message_id
     AND bot.session_id = batch.session_id
     AND bot.role = 'bot'
    LEFT JOIN public.chatbot_messages AS question
      ON question.id = bot.reply_to_message_id
     AND question.session_id = bot.session_id
     AND question.role = 'user'
  ),
  updated AS (
    UPDATE public.chatbot_feedback AS feedback
       SET question = source_questions.body,
           question_source_version = 1
      FROM source_questions
     WHERE feedback.id = source_questions.id
       AND feedback.question_source_version = 0
    RETURNING feedback.id
  )
  SELECT (SELECT batch.id FROM batch ORDER BY batch.id DESC LIMIT 1), count(updated.id)::integer
  FROM updated;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_chatbot_feedback_question_source(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_chatbot_feedback_question_source(uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';

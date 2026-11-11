-- Aggregate customer chatbot metrics in Postgres. New turns use the explicit
-- reply_to_message_id relation; legacy unpaired bot replies remain counted
-- separately instead of guessing a question by timestamp.
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
    SELECT m.id, m.session_id, m.role, m.body, m.kb_matched, m.reply_to_message_id, m.created_at
    FROM public.chatbot_messages m
    JOIN public.chatbot_sessions s ON s.id = m.session_id AND s.channel = 'customer'
    WHERE m.created_at >= p_from AND m.created_at < p_to
  ),
  paired_unanswered AS (
    SELECT q.body AS question, bot.created_at AS asked_at,
      lower(regexp_replace(btrim(q.body), '[[:space:][:punct:]]+', '', 'g')) AS normalized
    FROM customer_messages bot
    JOIN public.chatbot_messages q ON q.id = bot.reply_to_message_id AND q.role = 'user'
    WHERE bot.role = 'bot' AND coalesce(bot.kb_matched, false) = false
  ),
  feedback_rows AS MATERIALIZED (
    SELECT f.question, f.bot_answered, f.helpful, f.opened_ticket, f.created_at
    FROM public.chatbot_feedback f
    JOIN public.chatbot_sessions s ON s.id = f.session_id AND s.channel = 'customer'
    WHERE f.created_at >= p_from AND f.created_at < p_to
  ),
  unanswered_top AS (
    SELECT normalized, min(question) AS question, count(*)::integer AS count, max(asked_at) AS last_asked_at
    FROM paired_unanswered WHERE normalized <> '' GROUP BY normalized
    ORDER BY count DESC, last_asked_at DESC LIMIT 10
  ),
  not_helpful_top AS (
    SELECT lower(regexp_replace(btrim(question), '[[:space:][:punct:]]+', '', 'g')) AS normalized,
      min(question) AS question, count(*)::integer AS count, max(created_at) AS last_asked_at
    FROM feedback_rows WHERE bot_answered AND helpful = false AND nullif(btrim(question), '') IS NOT NULL
    GROUP BY 1 ORDER BY count DESC, last_asked_at DESC LIMIT 10
  ),
  escalated_top AS (
    SELECT lower(regexp_replace(btrim(question), '[[:space:][:punct:]]+', '', 'g')) AS normalized,
      min(question) AS question, count(*)::integer AS count, max(created_at) AS last_asked_at
    FROM feedback_rows WHERE opened_ticket AND (bot_answered = false OR helpful = false) AND nullif(btrim(question), '') IS NOT NULL
    GROUP BY 1 ORDER BY count DESC, last_asked_at DESC LIMIT 10
  ),
  totals AS (
    SELECT
      (SELECT count(*)::integer FROM customer_messages WHERE role = 'user') AS total_questions,
      (SELECT count(*)::integer FROM customer_messages WHERE role = 'bot') AS bot_count,
      (SELECT count(*)::integer FROM customer_messages WHERE role = 'bot' AND kb_matched) AS answered_count,
      (SELECT count(*)::integer FROM paired_unanswered) AS paired_unanswered_count,
      (SELECT count(*)::integer FROM customer_messages WHERE role = 'bot' AND reply_to_message_id IS NULL) AS legacy_unpaired_count,
      (SELECT count(*)::integer FROM feedback_rows WHERE bot_answered = false OR helpful = false) AS failed_feedback_count,
      (SELECT count(*)::integer FROM feedback_rows WHERE (bot_answered = false OR helpful = false) AND opened_ticket) AS escalated_feedback_count
  )
  SELECT jsonb_build_object(
    'totalQuestions', totals.total_questions,
    'answeredCount', totals.answered_count,
    'answerRate', CASE WHEN totals.bot_count = 0 THEN 0 ELSE totals.answered_count::numeric / totals.bot_count END,
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

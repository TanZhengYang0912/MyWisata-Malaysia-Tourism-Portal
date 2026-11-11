BEGIN;

INSERT INTO public.chatbot_sessions(id, session_key, channel)
VALUES ('cd000001-0000-4000-8000-000000000001', 'stats-test-session', 'customer');

INSERT INTO public.chatbot_messages(id, session_id, role, body, kb_matched, reply_to_message_id, created_at)
VALUES
  ('cd000002-0000-4000-8000-000000000001', 'cd000001-0000-4000-8000-000000000001', 'user', 'Refund update?', false, null, '2026-09-10T10:00:00Z'),
  ('cd000002-0000-4000-8000-000000000002', 'cd000001-0000-4000-8000-000000000001', 'bot', 'I cannot confirm this.', false, 'cd000002-0000-4000-8000-000000000001', '2026-09-10T10:00:01Z'),
  ('cd000002-0000-4000-8000-000000000003', 'cd000001-0000-4000-8000-000000000001', 'bot', 'Legacy response.', false, null, '2026-09-10T10:01:00Z');

DO $$
DECLARE
  v_stats jsonb;
BEGIN
  v_stats := public.get_customer_chatbot_stats('2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z');
  IF v_stats->>'totalQuestions' <> '1' THEN RAISE EXCEPTION 'expected one customer question'; END IF;
  IF v_stats->>'pairedUnansweredCount' <> '1' THEN RAISE EXCEPTION 'expected one explicitly paired unanswered turn'; END IF;
  IF v_stats->>'legacyUnpairedCount' <> '1' THEN RAISE EXCEPTION 'expected one unpaired legacy reply'; END IF;
END;
$$;

ROLLBACK;

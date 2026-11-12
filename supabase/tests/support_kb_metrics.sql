-- Run only against a disposable local Supabase/Postgres fixture.
BEGIN;
SET LOCAL statement_timeout = '20s';
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO public.chatbot_sessions (id, session_key, channel)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'metrics-customer', 'customer'),
  ('22222222-2222-4222-8222-222222222222', 'metrics-admin', 'admin');

INSERT INTO public.chatbot_messages (id, session_id, role, body, body_sanitized, kb_matched, reply_to_message_id, created_at)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'user', 'My refund status [EMAIL]', true, NULL, NULL, '2099-11-11 10:00:00+00'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '11111111-1111-4111-8111-111111111111', 'bot', 'Refund article', false, true, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '2099-11-11 10:00:01+00'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111111', 'user', 'Where is my booking?', false, NULL, NULL, '2099-11-11 11:00:00+00'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '11111111-1111-4111-8111-111111111111', 'bot', 'I cannot confirm.', false, false, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '2099-11-11 11:00:01+00'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '11111111-1111-4111-8111-111111111111', 'user', 'Please contact me at legacy@example.com', false, NULL, NULL, '2099-11-11 12:00:00+00'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', '11111111-1111-4111-8111-111111111111', 'bot', 'Legacy answer', false, false, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '2099-11-11 12:00:01+00'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '22222222-2222-4222-8222-222222222222', 'user', 'Admin question excluded', false, NULL, NULL, '2099-11-11 13:00:00+00'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', '11111111-1111-4111-8111-111111111111', 'bot', 'Wrong-session relation', false, false, 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '2099-11-11 13:00:01+00');

INSERT INTO public.chatbot_feedback (id, session_id, message_id, question, bot_answered, helpful, opened_ticket, created_at)
VALUES
(
  'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  '11111111-1111-4111-8111-111111111111',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  'untrusted@example.com', true, false, true, '2099-11-11 10:00:02+00'
),
(
  'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
  '11111111-1111-4111-8111-111111111111',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4',
  'legacy@example.com', false, false, true, '2099-11-11 12:00:02+00'
);

INSERT INTO public.chatbot_kb_documents (
  id, title, body, keywords, category, is_active, content_version, published_source_refs
)
VALUES
  ('33333333-3333-4333-8333-333333333331', 'Withdrawal timeline', 'Withdrawals are reviewed by Support.', ARRAY['withdraw', 'payout', 'how long', 'approval', 'money', 't8metricfixture'], 'wallet', true, 3, '[{"source":"reviewed-wallet-policy"}]'),
  ('33333333-3333-4333-8333-333333333332', 'Rewards', 'Earn rewards by sharing links.', ARRAY['earn', 'reward', 'money', 'how'], 'rewards', true, 1, '[]'),
  ('33333333-3333-4333-8333-333333333333', 'Tempahan status', 'Semak status tempahan anda.', ARRAY['tempahan', 'status', 'booking', 't8malayfixture'], 'booking', true, 2, '[{"source":"reviewed-booking-policy"}]'),
  ('33333333-3333-4333-8333-333333333334', 'Legacy refund', 'Unreviewed refund details.', ARRAY['refund', 'policy', 't8refundfixture'], 'payment', true, 1, '[]'),
  ('33333333-3333-4333-8333-333333333335', 'Reviewed refund', 'Contact Support for refund status.', ARRAY['refund', 'policy', 't8refundfixture'], 'payment', true, 4, '[{"source":"reviewed-refund-policy"}]'),
  ('33333333-3333-4333-8333-333333333336', '退款', '请查看退款政策。', ARRAY['退款', 't8zhfixture'], 'payment', true, 1, '[{"source":"reviewed-refund-cn"}]'),
  ('33333333-3333-4333-8333-333333333337', 'Inactive article', 'Should not match.', ARRAY['withdraw', 'money'], 'wallet', false, 1, '[{"source":"inactive"}]');

DO $$
DECLARE
  v_id uuid;
  v_count integer;
  v_ids uuid[];
  v_index integer;
BEGIN
  IF NOT has_function_privilege('anon', 'public.list_support_faq_categories()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.search_support_kb_keywords(text[],boolean[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAQ and keyword query RPC grants are incorrect';
  END IF;

  SELECT result.id INTO v_id
  FROM public.search_support_kb_keywords(
    ARRAY['how do I withdraw money t8metricfixture', 'Bagaimana status tempahan t8malayfixture?', 'refund policy t8refundfixture'],
    ARRAY[true, false, true]
  ) AS result
  WHERE result.question_index = 1;
  IF v_id <> '33333333-3333-4333-8333-333333333331'::uuid THEN
    RAISE EXCEPTION 'English stopword/keyword score changed: %', v_id;
  END IF;

  SELECT result.id INTO v_id
  FROM public.search_support_kb_keywords(ARRAY['how do I withdraw money t8metricfixture', 'Bagaimana status tempahan t8malayfixture?', 'refund policy t8refundfixture'], ARRAY[true, false, true]) AS result
  WHERE result.question_index = 2;
  IF v_id <> '33333333-3333-4333-8333-333333333333'::uuid THEN
    RAISE EXCEPTION 'Malay keyword match failed: %', v_id;
  END IF;

  SELECT result.id INTO v_id
  FROM public.search_support_kb_keywords(ARRAY['how do I withdraw money t8metricfixture', 'Bagaimana status tempahan t8malayfixture?', 'refund policy t8refundfixture'], ARRAY[true, false, true]) AS result
  WHERE result.question_index = 3;
  IF v_id <> '33333333-3333-4333-8333-333333333335'::uuid THEN
    RAISE EXCEPTION 'reviewed-only sensitive keyword match failed: %', v_id;
  END IF;

  SELECT result.id INTO v_id
  FROM public.search_support_kb_keywords(ARRAY['退款 t8zhfixture'], ARRAY[true]) AS result
  WHERE result.question_index = 1;
  IF v_id <> '33333333-3333-4333-8333-333333333336'::uuid THEN
    RAISE EXCEPTION 'Chinese keyword match failed: %', v_id;
  END IF;

  SELECT result.id INTO v_id
  FROM public.search_support_kb_keywords(ARRAY['Can I check tempahan booking status t8malayfixture?'], ARRAY[false]) AS result
  WHERE result.question_index = 1;
  IF v_id <> '33333333-3333-4333-8333-333333333333'::uuid THEN
    RAISE EXCEPTION 'Malay-English rojak match failed: %', v_id;
  END IF;

  FOR v_index IN 1..12 LOOP
    INSERT INTO public.chatbot_kb_documents (id, title, body, keywords, category, is_active, content_version, published_source_refs)
    VALUES (
      ('f0000000-0000-4000-8000-' || lpad(to_hex(v_index), 12, '0'))::uuid,
      'Stable candidate ' || v_index,
      'Candidate body ' || v_index,
      ARRAY['stablematch'], 'general', true, 1, '[]'
    );
  END LOOP;

  SELECT count(*)::integer, array_agg(result.id ORDER BY result.score DESC, result.id ASC)
    INTO v_count, v_ids
  FROM public.search_support_kb_keywords(ARRAY['stablematch'], ARRAY[false]) AS result;
  IF v_count <> 10 OR v_ids[1] <> 'f0000000-0000-4000-8000-000000000001'::uuid THEN
    RAISE EXCEPTION 'keyword results were not limited after deterministic scoring: %', v_ids;
  END IF;

  BEGIN
    PERFORM * FROM public.search_support_kb_keywords(ARRAY['one', 'two', 'three', 'four'], ARRAY[false, false, false, false]);
    RAISE EXCEPTION 'keyword RPC accepted more than three questions';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
END;
$$;

DO $$
DECLARE
  v_stats jsonb := public.get_customer_chatbot_stats('2099-11-10 00:00:00+00', '2099-11-12 00:00:00+00');
  v_cursor uuid;
  v_processed integer;
  v_question text;
BEGIN
  IF (v_stats->>'totalQuestions')::integer <> 3 THEN
    RAISE EXCEPTION 'expected 3 customer questions, got %', v_stats->>'totalQuestions';
  END IF;
  IF (v_stats->>'answeredCount')::integer <> 1 OR abs((v_stats->>'answerRate')::numeric - (1.0 / 3.0)) > 0.0001 THEN
    RAISE EXCEPTION 'answer rate must count user questions, got %', v_stats->>'answerRate';
  END IF;
  IF (v_stats->>'pairedUnansweredCount')::integer <> 2 OR (v_stats->>'legacyUnpairedCount')::integer <> 1 THEN
    RAISE EXCEPTION 'same-session coverage pairing is incorrect: %', v_stats;
  END IF;
  IF v_stats::text LIKE '%untrusted@example.com%' OR v_stats::text LIKE '%legacy@example.com%' OR v_stats::text NOT LIKE '%[EMAIL]%' THEN
    RAISE EXCEPTION 'feedback stats did not use the linked sanitized question: %', v_stats;
  END IF;
  IF v_stats::text LIKE '%Admin question excluded%' THEN
    RAISE EXCEPTION 'admin chatbot messages appeared in customer metrics';
  END IF;

  SELECT next_cursor, processed_count INTO v_cursor, v_processed
  FROM public.repair_chatbot_feedback_question_source(NULL, 100);
  IF v_processed <> 2 OR v_cursor <> 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'::uuid THEN
    RAISE EXCEPTION 'feedback question repair did not process its bounded rows';
  END IF;
  SELECT question INTO v_question
  FROM public.chatbot_feedback
  WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'::uuid;
  IF v_question <> 'My refund status [EMAIL]' THEN
    RAISE EXCEPTION 'feedback repair did not replace the untrusted echo with the linked turn';
  END IF;
  SELECT question INTO v_question
  FROM public.chatbot_feedback
  WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'::uuid;
  IF v_question IS NOT NULL THEN
    RAISE EXCEPTION 'feedback repair copied a legacy question without a sanitization marker';
  END IF;
  SELECT next_cursor, processed_count INTO v_cursor, v_processed
  FROM public.repair_chatbot_feedback_question_source(v_cursor, 100);
  IF v_cursor IS NOT NULL OR v_processed <> 0 THEN
    RAISE EXCEPTION 'feedback repair was not resumable/idempotent';
  END IF;

  v_stats := public.get_customer_chatbot_stats('2099-11-12 00:00:00+00', '2099-11-13 00:00:00+00');
  IF (v_stats->>'totalQuestions')::integer <> 0 OR (v_stats->>'answerRate')::numeric <> 0 OR jsonb_array_length(v_stats->'topCommon') <> 0 THEN
    RAISE EXCEPTION 'empty metrics range was not represented as zeroed aggregates: %', v_stats;
  END IF;
END;
$$;

ROLLBACK;

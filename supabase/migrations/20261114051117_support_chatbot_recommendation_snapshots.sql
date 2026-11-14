ALTER TABLE public.chatbot_messages
  ADD COLUMN recommendation_data jsonb,
  ADD CONSTRAINT chatbot_messages_recommendation_data_size_check
    CHECK (recommendation_data IS NULL OR pg_column_size(recommendation_data) <= 8192);

COMMENT ON COLUMN public.chatbot_messages.recommendation_data IS
  'Bounded, public catalogue snapshot shown with this chatbot answer; contains no inventory guarantee or private customer data.';

CREATE OR REPLACE FUNCTION public.complete_chatbot_ask_operation_with_recommendations(
  p_operation_id uuid,
  p_actor_key text,
  p_lease_token uuid,
  p_session_id uuid,
  p_user_message_id uuid,
  p_answer text,
  p_kb_matched boolean,
  p_answer_language text,
  p_privacy_blocked boolean,
  p_kb_refs jsonb,
  p_recommendation_data jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_bot_message_id uuid;
  v_kind text;
  v_products jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_service_role_required';
  END IF;
  IF p_recommendation_data IS NOT NULL THEN
    IF jsonb_typeof(p_recommendation_data) <> 'object'
       OR pg_column_size(p_recommendation_data) > 8192 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid_recommendations';
    END IF;
    v_kind := p_recommendation_data ->> 'kind';
    IF v_kind = 'results' THEN
      IF (p_recommendation_data - ARRAY['kind', 'products']) <> '{}'::jsonb THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid_recommendations';
      END IF;
      v_products := p_recommendation_data -> 'products';
      IF coalesce(jsonb_typeof(v_products), '') <> 'array' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid_recommendations';
      END IF;
      IF jsonb_array_length(v_products) < 1
         OR jsonb_array_length(v_products) > 3
         OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements(v_products) AS product(item)
            WHERE coalesce(jsonb_typeof(product.item), '') <> 'object'
               OR coalesce(product.item ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               OR coalesce(jsonb_typeof(product.item -> 'name'), '') <> 'string'
               OR coalesce(length(product.item ->> 'name'), 0) NOT BETWEEN 1 AND 160
               OR coalesce(product.item ->> 'category', '') NOT IN ('food', 'activity', 'accommodation', 'retail')
               OR coalesce(jsonb_typeof(product.item -> 'price'), '') <> 'number'
               OR CASE WHEN jsonb_typeof(product.item -> 'price') = 'number' THEN (product.item ->> 'price')::numeric < 0 ELSE false END
               OR coalesce(jsonb_typeof(product.item -> 'rating'), '') <> 'number'
               OR CASE WHEN jsonb_typeof(product.item -> 'rating') = 'number' THEN (product.item ->> 'rating')::numeric NOT BETWEEN 0 AND 5 ELSE false END
               OR coalesce(jsonb_typeof(product.item -> 'reviews'), '') <> 'number'
               OR CASE WHEN jsonb_typeof(product.item -> 'reviews') = 'number' THEN (product.item ->> 'reviews')::numeric < 0 ELSE false END
               OR coalesce(jsonb_typeof(product.item -> 'city'), '') <> 'string'
               OR coalesce(length(product.item ->> 'city'), 0) > 100
               OR coalesce(jsonb_typeof(product.item -> 'state'), '') <> 'string'
               OR coalesce(length(product.item ->> 'state'), 0) > 100
               OR (product.item - ARRAY['id', 'name', 'category', 'price', 'rating', 'reviews', 'city', 'state']) <> '{}'::jsonb
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid_recommendations';
      END IF;
    ELSIF v_kind = 'clarification' THEN
      IF (p_recommendation_data - ARRAY['kind', 'question', 'options']) <> '{}'::jsonb
         OR p_recommendation_data ->> 'question' <> 'category'
         OR coalesce(jsonb_typeof(p_recommendation_data -> 'options'), '') <> 'array' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid_recommendations';
      END IF;
      IF jsonb_array_length(p_recommendation_data -> 'options') <> 4
         OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements_text(p_recommendation_data -> 'options') AS option(slug)
            WHERE option.slug NOT IN ('food', 'activity', 'accommodation', 'retail')
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid_recommendations';
      END IF;
    ELSIF v_kind = 'no-results' THEN
      IF (p_recommendation_data - ARRAY['kind', 'category', 'state', 'priceMax', 'familyFriendlyOnly', 'options']) <> '{}'::jsonb
         OR coalesce(p_recommendation_data ->> 'category', '') NOT IN ('food', 'activity', 'accommodation', 'retail')
         OR coalesce(jsonb_typeof(p_recommendation_data -> 'options'), '') <> 'array' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid_recommendations';
      END IF;
      IF jsonb_array_length(p_recommendation_data -> 'options') > 2
         OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements_text(p_recommendation_data -> 'options') AS option(value)
            WHERE option.value NOT IN ('any-state', 'remove-budget')
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid_recommendations';
      END IF;
    ELSIF coalesce(v_kind, '') = 'unavailable' THEN
      IF (p_recommendation_data - ARRAY['kind']) <> '{}'::jsonb THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid_recommendations';
      END IF;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid_recommendations';
    END IF;
  END IF;

  v_bot_message_id := public.complete_chatbot_ask_operation_with_evidence(
    p_operation_id,
    p_actor_key,
    p_lease_token,
    p_session_id,
    p_user_message_id,
    p_answer,
    p_kb_matched,
    p_answer_language,
    p_privacy_blocked,
    p_kb_refs
  );

  UPDATE public.chatbot_messages
     SET recommendation_data = p_recommendation_data
   WHERE id = v_bot_message_id
     AND session_id = p_session_id
     AND role = 'bot';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_result_missing';
  END IF;
  RETURN v_bot_message_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_chatbot_ask_operation_with_recommendations(uuid, text, uuid, uuid, uuid, text, boolean, text, boolean, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_chatbot_ask_operation_with_recommendations(uuid, text, uuid, uuid, uuid, text, boolean, text, boolean, jsonb, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';

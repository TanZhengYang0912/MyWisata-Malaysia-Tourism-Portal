CREATE FUNCTION app_private.mutate_customer_trip_batch(
  p_trip_id text,
  p_expected_version timestamptz,
  p_input jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.trips%ROWTYPE;
  product_id uuid;
  selection jsonb;
  product_ids uuid[] := '{}';
  ordered_ids text[] := '{}';
  receipt jsonb;
  result_items jsonb;
  version timestamptz;
  scheduled_date date;
  skipped_ids jsonb := '[]'::jsonb;
  entry text;
  item_count integer;
  new_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT * INTO t FROM public.trips WHERE id=p_trip_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trip_not_found'; END IF;
  IF p_expected_version IS NULL OR t.updated_at IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'trip_changed'; END IF;
  version := t.updated_at;
  IF jsonb_typeof(p_input) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_input->'selections') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_input->'order') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_input->'selections') NOT BETWEEN 1 AND 10
    OR jsonb_array_length(p_input->'order')>1000 THEN RAISE EXCEPTION 'trip_batch_invalid'; END IF;

  scheduled_date := (p_input->>'scheduled_date')::date;
  IF t.start_date IS NULL OR t.end_date IS NULL OR scheduled_date<t.start_date OR scheduled_date>t.end_date THEN
    RAISE EXCEPTION 'trip_schedule_invalid';
  END IF;
  FOR selection IN SELECT value FROM jsonb_array_elements(p_input->'selections') LOOP
    IF jsonb_typeof(selection) IS DISTINCT FROM 'object'
      OR (selection->>'product_id') IS NULL OR (selection->>'outlet_id') IS NULL THEN RAISE EXCEPTION 'trip_batch_invalid'; END IF;
    product_id := (selection->>'product_id')::uuid;
    IF product_id=ANY(product_ids) THEN RAISE EXCEPTION 'trip_batch_duplicate'; END IF;
    product_ids := array_append(product_ids,product_id);
  END LOOP;
  SELECT count(*) INTO item_count FROM public.trip_items WHERE trip_id=t.id;
  SELECT count(*) INTO new_count FROM unnest(product_ids) requested(id)
    WHERE NOT EXISTS(SELECT 1 FROM public.trip_items i WHERE i.trip_id=t.id AND i.experience_id=requested.id);
  IF item_count + new_count>1000 THEN RAISE EXCEPTION 'trip_item_limit'; END IF;

  FOREACH product_id IN ARRAY product_ids LOOP
    IF EXISTS(SELECT 1 FROM public.trip_items WHERE trip_id=t.id AND experience_id=product_id) THEN
      skipped_ids := skipped_ids || jsonb_build_array(product_id::text);
    ELSE
      SELECT value INTO selection FROM jsonb_array_elements(p_input->'selections') WHERE (value->>'product_id')::uuid=product_id;
      receipt := app_private.mutate_customer_trip(t.id,version,'add',jsonb_build_object(
        'source','vendor','experience_id',product_id,'outlet_id',selection->>'outlet_id','scheduled_date',scheduled_date,
        'lat',0,'lng',0
      ));
      version := (receipt->>'version')::timestamptz;
      UPDATE public.trip_items i SET
        lat=coalesce(p.place_lat,o.lat,i.lat),lng=coalesce(p.place_lng,o.lng,i.lng)
      FROM public.products p
      JOIN public.outlets o ON o.id=(selection->>'outlet_id')::uuid
      WHERE i.trip_id=t.id AND i.experience_id=product_id AND p.id=product_id;
    END IF;
  END LOOP;

  -- Convert the caller's complete trip order into database item IDs. Product
  -- tokens must name a product in this batch; item tokens must belong to this trip.
  FOR entry IN SELECT jsonb_array_elements_text(p_input->'order') LOOP
    IF entry LIKE 'product:%' THEN
      product_id := substring(entry FROM 9)::uuid;
      IF NOT product_id=ANY(product_ids) THEN RAISE EXCEPTION 'trip_order_invalid'; END IF;
      SELECT id INTO entry FROM public.trip_items WHERE trip_id=t.id AND experience_id=product_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'trip_order_invalid'; END IF;
      ordered_ids := array_append(ordered_ids,entry);
    ELSIF entry LIKE 'item:%' THEN
      entry := substring(entry FROM 6);
      IF NOT EXISTS(SELECT 1 FROM public.trip_items WHERE trip_id=t.id AND id=entry) THEN RAISE EXCEPTION 'trip_order_invalid'; END IF;
      ordered_ids := array_append(ordered_ids,entry);
    ELSE RAISE EXCEPTION 'trip_order_invalid'; END IF;
  END LOOP;

  SELECT count(*) INTO item_count FROM public.trip_items WHERE trip_id=t.id;
  IF cardinality(ordered_ids)<>item_count
    OR (SELECT count(DISTINCT id) FROM unnest(ordered_ids) id)<>item_count
    OR EXISTS(SELECT 1 FROM public.trip_items i WHERE i.trip_id=t.id AND NOT (i.id=ANY(ordered_ids))) THEN
    RAISE EXCEPTION 'trip_order_invalid';
  END IF;
  receipt := app_private.mutate_customer_trip(t.id,version,'reorder',jsonb_build_object('ids',to_jsonb(ordered_ids)));
  version := (receipt->>'version')::timestamptz;
  result_items := receipt->'value';
  RETURN jsonb_build_object('value',jsonb_build_object('items',result_items,'skipped_product_ids',skipped_ids),'version',version);
END;
$$;

REVOKE ALL ON FUNCTION app_private.mutate_customer_trip_batch(text,timestamptz,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.mutate_customer_trip_batch(text,timestamptz,jsonb) TO authenticated;

CREATE FUNCTION public.mutate_customer_trip_batch(p_trip_id text,p_expected_version timestamptz,p_input jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.mutate_customer_trip_batch($1,$2,$3);
$$;
REVOKE ALL ON FUNCTION public.mutate_customer_trip_batch(text,timestamptz,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.mutate_customer_trip_batch(text,timestamptz,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';

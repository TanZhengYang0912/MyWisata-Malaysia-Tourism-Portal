CREATE FUNCTION app_private.update_customer_trip_dates(
  p_trip_id text,
  p_expected_version timestamptz,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  t public.trips%ROWTYPE;
  v_day_delta integer;
  v_version timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'trip_dates_invalid';
  END IF;

  SELECT * INTO t
  FROM public.trips
  WHERE id = p_trip_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trip_not_found'; END IF;
  IF p_expected_version IS NULL OR t.updated_at IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'trip_changed';
  END IF;

  IF t.start_date = p_start_date AND t.end_date = p_end_date THEN
    RETURN jsonb_build_object('value', to_jsonb(t) - 'legacy_id', 'version', t.updated_at);
  END IF;

  v_day_delta := CASE WHEN t.start_date IS NULL THEN 0 ELSE p_start_date - t.start_date END;
  IF v_day_delta <> 0 THEN
    UPDATE public.trip_items
    SET scheduled_date = scheduled_date + v_day_delta
    WHERE trip_id = t.id AND scheduled_date IS NOT NULL;
  END IF;

  UPDATE public.trips
  SET start_date = p_start_date,
      end_date = p_end_date,
      updated_at = greatest(clock_timestamp(), t.updated_at + interval '1 microsecond')
  WHERE id = t.id
  RETURNING * INTO t;

  PERFORM app_private.assert_trip_schedule(t.id);
  v_version := t.updated_at;
  RETURN jsonb_build_object('value', to_jsonb(t) - 'legacy_id', 'version', v_version);
END;
$$;

REVOKE ALL ON FUNCTION app_private.update_customer_trip_dates(text,timestamptz,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.update_customer_trip_dates(text,timestamptz,date,date) TO authenticated;

CREATE FUNCTION public.update_customer_trip_dates(
  p_trip_id text,
  p_expected_version timestamptz,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.update_customer_trip_dates($1, $2, $3, $4);
$$;

REVOKE ALL ON FUNCTION public.update_customer_trip_dates(text,timestamptz,date,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.update_customer_trip_dates(text,timestamptz,date,date) TO authenticated;

NOTIFY pgrst, 'reload schema';

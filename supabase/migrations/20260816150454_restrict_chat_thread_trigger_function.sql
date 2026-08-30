CREATE OR REPLACE FUNCTION public.set_chat_thread_vendor_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT o.vendor_id
  INTO NEW.vendor_id
  FROM public.outlets AS o
  WHERE o.id = NEW.outlet_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_chat_thread_vendor_id() FROM PUBLIC, anon, authenticated;;

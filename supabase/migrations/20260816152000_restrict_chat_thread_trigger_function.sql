-- The vendor-id trigger function is an internal database hook, not an RPC
-- surface. Keep it callable by the trigger while removing direct client
-- execution privileges.

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

REVOKE ALL ON FUNCTION public.set_chat_thread_vendor_id() FROM PUBLIC, anon, authenticated;

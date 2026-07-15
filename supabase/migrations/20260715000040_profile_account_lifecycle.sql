-- Profile account lifecycle: reversible soft deletion with server-owned status.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.protect_account_lifecycle_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('app.allow_account_status_write', true) = 'on'
     OR is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
    RAISE EXCEPTION 'account_lifecycle_fields_are_server_managed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_account_lifecycle_fields ON public.users;
CREATE TRIGGER protect_account_lifecycle_fields
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_account_lifecycle_fields();

CREATE OR REPLACE FUNCTION public.close_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT status INTO v_status FROM public.users WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_status = 'suspended' THEN RAISE EXCEPTION 'account_suspended'; END IF;
  IF v_status = 'deleted' THEN RETURN; END IF;

  PERFORM set_config('app.allow_account_status_write', 'on', true);
  UPDATE public.users
     SET status = 'deleted', closed_at = now(), updated_at = now()
   WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_my_account()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_status TEXT; v_email_verified BOOLEAN; v_tier TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT status, email_verified_at IS NOT NULL INTO v_status, v_email_verified
    FROM public.users WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_status = 'suspended' THEN RAISE EXCEPTION 'account_suspended'; END IF;
  IF v_status <> 'deleted' THEN RAISE EXCEPTION 'account_not_deleted'; END IF;

  v_tier := CASE WHEN v_email_verified THEN 'email_verified' ELSE 'email_unverified' END;
  PERFORM set_config('app.allow_account_status_write', 'on', true);
  PERFORM set_config('app.allow_verification_write', 'on', true);
  UPDATE public.users
     SET status = 'active', closed_at = NULL,
         tier = v_tier,
         kyc_status = 'unverified',
         phone_verified_at = NULL,
         profile_completed_at = NULL,
         updated_at = now()
   WHERE id = auth.uid();
  RETURN v_tier;
END;
$$;

REVOKE ALL ON FUNCTION public.close_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_my_account() TO authenticated;
REVOKE ALL ON FUNCTION public.restore_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_my_account() TO authenticated;

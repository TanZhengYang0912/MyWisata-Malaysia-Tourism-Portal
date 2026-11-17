-- Keep the recorded emergency restore in migration history. The current
-- locale route saves the browser cookie and no longer calls the account RPC.
DROP FUNCTION IF EXISTS public.set_my_preferred_locale(text);
NOTIFY pgrst, 'reload schema';

-- 20260926063036_use_invoker_for_unread_counts.sql made get_support_unread_count()
-- SECURITY INVOKER on the assumption that the caller could read support_tickets
-- under RLS. The app reads tickets through the service role only, and the
-- authenticated role has no table privilege on support_tickets, so every call
-- failed with "permission denied for table support_tickets" and the unread
-- badge returned 503 on every admin page.
--
-- Restore SECURITY DEFINER for this one function. It is safe to run with owner
-- privileges: it takes no arguments, derives the caller from auth.uid(), has a
-- fixed search_path, builds no dynamic SQL, and returns a single integer that is
-- already scoped to that caller (all unread customer replies for a super admin,
-- otherwise only the caller's own tickets). get_chat_unread_count() is left as it is.
ALTER FUNCTION public.get_support_unread_count() SECURITY DEFINER;
ALTER FUNCTION public.get_support_unread_count() SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_support_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_support_unread_count() TO authenticated;

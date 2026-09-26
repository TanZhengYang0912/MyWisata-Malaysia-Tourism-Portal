-- These aggregates already have matching row-level security policies on their
-- source tables. Run as the authenticated caller so those policies remain an
-- active boundary and the functions do not need elevated privileges.

ALTER FUNCTION public.get_chat_unread_count() SECURITY INVOKER;
ALTER FUNCTION public.get_support_unread_count() SECURITY INVOKER;

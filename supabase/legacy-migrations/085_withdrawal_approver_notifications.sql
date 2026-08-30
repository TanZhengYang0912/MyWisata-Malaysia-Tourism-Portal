-- Notify every active Wallet Approver and Super Admin whenever a withdrawal
-- enters a new review cycle. Email delivery is handled by the application
-- outbox; this trigger guarantees the in-app alert also exists for direct RPC
-- callers and is idempotent with the application fan-out.

CREATE OR REPLACE FUNCTION public.notify_withdrawal_approvers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications(
    user_id, type, title, body, link, event_key, category, metadata
  )
  SELECT DISTINCT
    ur.user_id,
    'withdrawal_submitted',
    'New withdrawal requires review',
    'A customer submitted a withdrawal for review.',
    '/admin/withdrawals/' || NEW.id::text,
    'withdrawal_submitted:' || NEW.id::text || ':cycle:' || COALESCE(NEW.approval_cycle, 1)::text || ':approver:' || ur.user_id::text,
    'wallet',
    jsonb_build_object('withdrawal_id', NEW.id, 'approval_cycle', COALESCE(NEW.approval_cycle, 1))
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.users u ON u.id = ur.user_id AND u.status = 'active'
  WHERE r.name IN ('approver', 'super_admin')
    AND ur.user_id <> NEW.user_id
  ON CONFLICT (event_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_approver_notification ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_approver_notification
  AFTER INSERT ON public.withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_withdrawal_approvers();

REVOKE ALL ON FUNCTION public.notify_withdrawal_approvers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_withdrawal_approvers() TO service_role;

NOTIFY pgrst, 'reload schema';

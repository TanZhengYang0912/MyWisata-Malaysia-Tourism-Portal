-- RLS limits visible ticket rows; column grants keep internal ticket fields
-- server-only even for a customer reading their own support_tickets row.
REVOKE SELECT ON TABLE public.support_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id,
  user_id,
  subject,
  category,
  status,
  withdrawal_id,
  created_at,
  last_reply_at,
  customer_last_read_at
) ON TABLE public.support_tickets TO authenticated;

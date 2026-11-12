-- The RPC result now includes the order's customer-facing reference. PostgreSQL
-- requires a drop/recreate when a RETURNS TABLE column is added or changed.
DROP FUNCTION IF EXISTS public.list_support_customer_refunds(uuid);

CREATE FUNCTION public.list_support_customer_refunds(p_owner_user_id uuid)
RETURNS TABLE (
  id uuid,
  order_id uuid,
  order_display_id text,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT refund.id, refund.order_id, customer_order.display_id::text, refund.status::text, refund.created_at
  FROM public.refunds AS refund
  JOIN public.orders AS customer_order ON customer_order.id = refund.order_id
  WHERE customer_order.user_id = p_owner_user_id
  ORDER BY refund.created_at DESC, refund.id DESC
  LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.list_support_customer_refunds(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_support_customer_refunds(uuid) TO service_role;

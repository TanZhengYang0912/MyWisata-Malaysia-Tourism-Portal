-- The authenticated subject is the sole owner filter; no caller-supplied user ID.
CREATE OR REPLACE FUNCTION public.list_my_orders(
  p_page integer DEFAULT 1, p_query text DEFAULT '', p_status text DEFAULT 'all',
  p_kind text DEFAULT 'all', p_outlet_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  IF p_page < 1 OR p_page > 1000000 OR length(p_query) > 200
    OR p_status NOT IN ('all','paid','completed','pending_payment','cancelled','refunded')
    OR p_kind NOT IN ('all','booking','product','mixed')
    OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to) THEN
    RAISE EXCEPTION 'invalid_order_filters' USING ERRCODE='22023';
  END IF;
  WITH owned AS MATERIALIZED (
    SELECT o.id,o.display_id,o.user_id,o.status,o.subtotal,o.discount_amount,o.total_amount,o.payment_method,o.created_at,
      CASE WHEN EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id=o.id AND i.slot_starts_at IS NOT NULL)
        THEN CASE WHEN EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id=o.id AND i.slot_starts_at IS NULL) THEN 'mixed' ELSE 'booking' END
        ELSE 'product' END AS kind
    FROM public.orders o WHERE o.user_id=(SELECT auth.uid())
  ), filtered AS MATERIALIZED (
    SELECT o.* FROM owned o
    WHERE (p_status='all' OR o.status::text=p_status) AND (p_kind='all' OR o.kind=p_kind)
      AND (p_from IS NULL OR o.created_at>=p_from) AND (p_to IS NULL OR o.created_at<=p_to)
      AND (p_outlet_id IS NULL OR EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id=o.id AND i.outlet_id=p_outlet_id))
      AND (btrim(p_query)='' OR position(lower(btrim(p_query)) IN lower(concat_ws(' ',o.id::text,o.display_id::text,
        (SELECT string_agg(concat_ws(' ',i.product_name,i.variant_name,s.name),' ') FROM public.order_items i LEFT JOIN public.outlets s ON s.id=i.outlet_id WHERE i.order_id=o.id))))>0)
  ), counts AS (SELECT count(*) AS total FROM filtered), bounds AS (
    SELECT total,least(p_page,greatest(1,ceil(total/10.0)::integer)) AS page FROM counts
  ), selected AS (
    SELECT o.* FROM filtered o ORDER BY o.created_at DESC,o.id DESC LIMIT 10 OFFSET (SELECT (page-1)*10 FROM bounds)
  )
  SELECT jsonb_build_object(
    'total',(SELECT total FROM bounds),'page',(SELECT page FROM bounds),'pageSize',10,
    'stats',(SELECT jsonb_build_object('total',count(*),'paid',count(*) FILTER (WHERE status::text IN ('paid','completed')),'bookings',count(*) FILTER (WHERE kind<>'product')) FROM owned),
    'outlets',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) ORDER BY s.name,s.id) FROM public.outlets s
      WHERE EXISTS (SELECT 1 FROM public.order_items i JOIN owned o ON o.id=i.order_id WHERE i.outlet_id=s.id)),'[]'::jsonb),
    'orders',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',o.id,'display_id',o.display_id,'user_id',o.user_id,'status',o.status,
      'subtotal',o.subtotal,'discount_amount',o.discount_amount,'total_amount',o.total_amount,
      'payment_method',o.payment_method,'created_at',o.created_at,
      'order_items',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'product_id',i.product_id,'product_name',i.product_name,'image_url',i.image_url,
        'variant_name',i.variant_name,'slot_starts_at',i.slot_starts_at,'nights',i.nights,
        'unit_price',i.unit_price,'quantity',i.quantity,'outlet_id',i.outlet_id,
        'products',jsonb_build_object('cover_url',p.cover_url,'categories',jsonb_build_object('slug',c.slug))
      ) ORDER BY i.id) FROM public.order_items i LEFT JOIN public.products p ON p.id=i.product_id LEFT JOIN public.categories c ON c.id=p.category_id WHERE i.order_id=o.id),'[]'::jsonb)
    ) ORDER BY o.created_at DESC,o.id DESC) FROM selected o),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.list_my_orders(integer,text,text,text,uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_my_orders(integer,text,text,text,uuid,timestamptz,timestamptz) TO authenticated;

-- A service operator can recover one exhausted current-cycle job. Preserve cursor
-- and event keys, so already delivered recipients cannot receive duplicate alerts.
CREATE OR REPLACE FUNCTION app_private.requeue_withdrawal_approver_job(
  p_id uuid,p_cycle integer,p_stage text,p_reason text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job app_private.withdrawal_approver_jobs%ROWTYPE;
BEGIN
  PERFORM app_private.require_kyc_job_service();
  IF p_stage NOT IN ('pending','pending_second_approval','overdue') OR length(btrim(p_reason)) NOT BETWEEN 5 AND 300 OR p_reason IS NULL THEN
    RAISE EXCEPTION 'invalid_job_recovery' USING ERRCODE='22023';
  END IF;
  -- Match the worker lock order: withdrawal first, then notification job.
  PERFORM 1 FROM public.withdrawal_requests w WHERE w.id=p_id AND w.status=p_stage AND coalesce(w.approval_cycle,1)=p_cycle FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO job FROM app_private.withdrawal_approver_jobs WHERE withdrawal_id=p_id AND cycle=p_cycle AND stage=p_stage FOR UPDATE;
  IF NOT FOUND OR job.completed OR job.attempts<10 OR job.lease_until>now() THEN RETURN false; END IF;
  UPDATE app_private.withdrawal_approver_jobs SET attempts=0,token=NULL,lease_until=NULL,available_at=now()
    WHERE withdrawal_id=p_id AND cycle=p_cycle AND stage=p_stage;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data,note)
  VALUES (NULL,'withdrawal.approver_notification_job_requeued','withdrawal_notification_job',p_id,
    jsonb_build_object('cycle',p_cycle,'stage',p_stage,'attempts',job.attempts,'cursor_id',job.cursor_id),
    jsonb_build_object('cycle',p_cycle,'stage',p_stage,'attempts',0,'available_at',now()),p_reason);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION app_private.requeue_withdrawal_approver_job(uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.requeue_withdrawal_approver_job(uuid,integer,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.requeue_withdrawal_approver_job(p_id uuid,p_cycle integer,p_stage text,p_reason text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT app_private.requeue_withdrawal_approver_job(p_id,p_cycle,p_stage,p_reason) $$;
REVOKE ALL ON FUNCTION public.requeue_withdrawal_approver_job(uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_withdrawal_approver_job(uuid,integer,text,text) TO service_role;
NOTIFY pgrst,'reload schema';

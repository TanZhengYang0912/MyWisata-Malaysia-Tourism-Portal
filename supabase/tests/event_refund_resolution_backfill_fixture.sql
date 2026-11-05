-- Loopback-only legacy row: closed by the old processed-refund trigger before
-- that trigger wrote a resolution_code.
DO $$
DECLARE
  v_order uuid := 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  v_item uuid := 'bbbbbbb3-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
  v_payment uuid := gen_random_uuid();
  v_refund uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.orders(
    id,user_id,status,subtotal,discount_amount,total_amount,payment_method,paid_at
  ) VALUES (
    v_order,'00000000-0000-0000-0000-000000000004','paid',12,0,12,'mock_card',now()
  );
  INSERT INTO public.order_items(
    id,order_id,vendor_id,outlet_id,product_name,variant_name,unit_price,
    quantity,line_total,fulfil_status,event_listing_id,event_location_id,
    pickup_date,pickup_slot_id
  ) VALUES (
    v_item,v_order,'11111111-1111-4111-8111-111111111111',NULL,'Refund history fixture',
    'Main Hall · 10:00–12:00',12,1,12,'pending',
    '77777777-7777-4777-8777-777777777777',
    '55555555-5555-4555-8555-555555555555',date '2026-10-10',
    '88888888-8888-4888-8888-888888888888'
  );
  INSERT INTO public.payments(id,order_id,method,provider,amount,status)
  VALUES(v_payment,v_order,'mock_card','event-refund-test',12,'succeeded');
  INSERT INTO public.refunds(id,order_id,payment_id,amount,reason,status)
  VALUES(v_refund,v_order,v_payment,12,'Historical processed-refund fixture','pending');
  INSERT INTO public.event_order_exceptions(
    source_key,kind,order_id,payment_id,refund_id,reason_code,state,
    resolved_at,resolution_note
  ) VALUES (
    'legacy-processed-refund-resolution-test','refund_attention',v_order,
    v_payment,v_refund,'refund_review_required','open',NULL,NULL
  );
  -- Reproduce the old trigger: it closes the exception but leaves the new
  -- resolution_code column NULL.
  UPDATE public.refunds SET status='processed',processed_at=now() WHERE id=v_refund;
  IF NOT EXISTS (
    SELECT 1 FROM public.event_order_exceptions
    WHERE source_key='legacy-processed-refund-resolution-test'
      AND state='resolved' AND resolution_code IS NULL
  ) THEN
    RAISE EXCEPTION 'legacy processed-refund fixture did not reproduce the old trigger';
  END IF;
  INSERT INTO public.event_order_exceptions(
    source_key,kind,order_id,payment_id,reason_code,state
  ) VALUES (
    'insert-processed-refund-resolution-test','refund_attention',v_order,
    v_payment,'refund_review_required','open'
  );
END;
$$;

SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.event_order_exceptions
   WHERE source_key='legacy-processed-refund-resolution-test'
     AND state='resolved' AND resolution_code='refunded') THEN
   RAISE EXCEPTION 'historical processed refund resolution was not backfilled: %',
     (SELECT jsonb_build_object('state',e.state,'resolutionCode',e.resolution_code,'refundStatus',r.status)
      FROM public.event_order_exceptions e LEFT JOIN public.refunds r ON r.id=e.refund_id
      WHERE e.source_key='legacy-processed-refund-resolution-test');
 END IF;
END $$;
DO $$ DECLARE v_order uuid; v_payment uuid; BEGIN
 SELECT order_id,payment_id INTO v_order,v_payment FROM public.event_order_exceptions
 WHERE source_key='insert-processed-refund-resolution-test';
 INSERT INTO public.refunds(order_id,payment_id,amount,reason,status)
 VALUES(v_order,v_payment,12,'Direct processed-refund insert fixture','processed');
 IF NOT EXISTS(SELECT 1 FROM public.event_order_exceptions
   WHERE source_key='insert-processed-refund-resolution-test'
     AND state='resolved' AND resolution_code='refunded') THEN
   RAISE EXCEPTION 'direct processed refund insert did not resolve and classify case';
 END IF;
END $$;
DO $$ DECLARE oid uuid:='aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1'; vid uuid:='11111111-1111-4111-8111-111111111111'; wid uuid; c uuid; v integer; err text; result jsonb; BEGIN
 UPDATE public.order_items SET fulfil_status='pending',fulfilled_at=NULL,pickup_date=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date+10 WHERE order_id=oid;
 PERFORM public.settle_order_vendor_earnings(oid);
 UPDATE public.order_settlements SET hold_until=now()-interval '1 day' WHERE order_id=oid;
 SELECT id INTO wid FROM public.wallets WHERE user_id='00000000-0000-0000-0000-000000000002';
 PERFORM public.clear_matured_vendor_settlements(false);
 IF (SELECT earnings_sen FROM public.wallets WHERE id=wid)<>0 THEN RAISE EXCEPTION 'future uncollected event funds were released'; END IF;
 PERFORM public.clear_matured_vendor_settlements(true);
 IF (SELECT earnings_sen FROM public.wallets WHERE id=wid)<>0 THEN RAISE EXCEPTION 'ignore_hold bypassed fulfilment'; END IF;
 BEGIN UPDATE public.wallets SET pending_earnings_sen=pending_earnings_sen-1,earnings_sen=earnings_sen+1 WHERE id=wid; EXCEPTION WHEN OTHERS THEN err:=SQLERRM; END;
 IF err IS DISTINCT FROM 'event_funds_reserved' THEN RAISE EXCEPTION 'shared bucket promotion bypass: %',err; END IF;
 err:=NULL;
 BEGIN UPDATE public.wallets SET pending_earnings_sen=pending_earnings_sen-1 WHERE id=wid; EXCEPTION WHEN OTHERS THEN err:=SQLERRM; END;
 IF err IS DISTINCT FROM 'event_funds_reserved' THEN RAISE EXCEPTION 'pending-only debit consumed event reserve: %',err; END IF;
 -- Roll back the real reversal proof so the same held order can test no-show.
 BEGIN
  PERFORM public.reverse_order_vendor_settlement(oid,NULL);
  IF NOT EXISTS(SELECT 1 FROM public.order_settlements WHERE order_id=oid AND status='reversed') THEN RAISE EXCEPTION 'canonical event reversal failed'; END IF;
  RAISE EXCEPTION 'rollback_reversal_fixture';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'rollback_reversal_fixture' THEN RAISE; END IF;
 END;

 UPDATE public.order_items SET pickup_date=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date-1 WHERE order_id=oid;
 result:=public.refresh_overdue_event_pickups();
 PERFORM public.refresh_overdue_event_pickups();
 SELECT id,version INTO c,v FROM public.event_order_exceptions WHERE order_id=oid AND kind='pickup_overdue';
 IF c IS NULL OR (SELECT count(*) FROM public.event_order_exceptions WHERE order_id=oid AND kind='pickup_overdue')<>1 THEN RAISE EXCEPTION 'overdue discovery not idempotent'; END IF;
 result:=public.get_event_reservation_operations_filtered('00000000-0000-0000-0000-000000000001','{"caseKind":"pickup_overdue"}');
 IF (result->>'total')::integer<1 THEN RAISE EXCEPTION 'overdue filter missing'; END IF;
 err:=NULL;
 BEGIN PERFORM public.update_event_order_exception(c,'00000000-0000-0000-0000-000000000004',v,'confirm_no_show',NULL,'Customer absence verified with vendor'); EXCEPTION WHEN OTHERS THEN err:=SQLERRM; END;
 IF err IS DISTINCT FROM 'super_admin_required' THEN RAISE EXCEPTION 'ordinary user resolved no-show'; END IF;
 PERFORM public.update_event_order_exception(c,'00000000-0000-0000-0000-000000000001',v,'claim',now()+interval '1 day',NULL);
 err:=NULL;
 BEGIN PERFORM public.update_event_order_exception(c,'00000000-0000-0000-0000-000000000001',v,'confirm_no_show',NULL,'Customer absence verified with vendor'); EXCEPTION WHEN OTHERS THEN err:=SQLERRM; END;
 IF err IS DISTINCT FROM 'event_exception_changed' THEN RAISE EXCEPTION 'stale resolution accepted'; END IF;
 SELECT version INTO v FROM public.event_order_exceptions WHERE id=c;
 PERFORM public.update_event_order_exception(c,'00000000-0000-0000-0000-000000000001',v,'confirm_no_show',NULL,'Customer absence verified with vendor and contact attempts');
 PERFORM public.refresh_overdue_event_pickups();
 IF NOT EXISTS(SELECT 1 FROM public.event_order_exceptions WHERE id=c AND state='resolved' AND resolution_code='customer_no_show') THEN RAISE EXCEPTION 'no-show disposition lost'; END IF;
 IF NOT app_private.event_settlement_release_allowed(oid,vid) THEN RAISE EXCEPTION 'durable no-show resolution does not permit release'; END IF;
 UPDATE public.order_settlements SET hold_until=now()+interval '1 day' WHERE order_id=oid;
 PERFORM public.clear_matured_vendor_settlements(true);
 IF (SELECT earnings_sen FROM public.wallets WHERE id=wid)<>0 THEN RAISE EXCEPTION 'no-show bypassed event waiting period'; END IF;
 UPDATE public.order_settlements SET hold_until=now()-interval '1 day' WHERE order_id=oid;

 INSERT INTO public.refunds(order_id,payment_id,amount,reason,status) SELECT oid,id,12,'Customer dispute after no-show','pending' FROM public.payments WHERE order_id=oid LIMIT 1;
 IF app_private.event_settlement_release_allowed(oid,vid) THEN RAISE EXCEPTION 'new refund bypassed settled no-show disposition'; END IF;
 PERFORM public.clear_matured_vendor_settlements(false);
 IF (SELECT earnings_sen FROM public.wallets WHERE id=wid)<>0 THEN RAISE EXCEPTION 'pending refund funds released'; END IF;
 DELETE FROM public.refunds WHERE order_id=oid;
 UPDATE public.order_items SET fulfil_status='fulfilled',fulfilled_at=now() WHERE order_id=oid;
 PERFORM public.clear_matured_vendor_settlements(false);
 IF (SELECT earnings_sen FROM public.wallets WHERE id=wid)<=0 THEN RAISE EXCEPTION 'fulfilled and matured settlement not released'; END IF;
 -- Normal shop funds stay releasable even while event reserves remain held.
 IF NOT app_private.event_settlement_release_allowed(gen_random_uuid(),vid) THEN RAISE EXCEPTION 'ordinary order gate changed'; END IF;
 IF has_function_privilege('authenticated' ,'public.refresh_overdue_event_pickups()','EXECUTE') THEN RAISE EXCEPTION 'discovery RPC exposed'; END IF;
END $$;

-- Refund linkage preserves one case and its owner; collected status alone cannot
-- close a case while a customer refund is still pending.
DO $$ DECLARE oid uuid:='aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2'; c uuid; v integer; rid uuid; err text; BEGIN
 UPDATE public.order_items SET fulfil_status='pending',fulfilled_at=NULL,pickup_date=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date-1 WHERE order_id=oid;
 PERFORM public.refresh_overdue_event_pickups();
 SELECT id,version INTO c,v FROM public.event_order_exceptions WHERE order_id=oid AND kind='pickup_overdue';
 PERFORM public.update_event_order_exception(c,'00000000-0000-0000-0000-000000000001',v,'claim',now()+interval '1 day',NULL);
 INSERT INTO public.refunds(order_id,payment_id,amount,reason,status) SELECT oid,id,0,'Awaiting refund approval','pending' FROM public.payments WHERE order_id=oid LIMIT 1 RETURNING id INTO rid;
 IF (SELECT count(*) FROM public.event_order_exceptions WHERE order_id=oid AND state='open')<>1 THEN RAISE EXCEPTION 'refund duplicated pickup obligation'; END IF;
 SELECT version INTO v FROM public.event_order_exceptions WHERE id=c;
 UPDATE public.order_items SET fulfil_status='fulfilled',fulfilled_at=now() WHERE order_id=oid;
 PERFORM public.refresh_overdue_event_pickups();
 IF NOT EXISTS(SELECT 1 FROM public.event_order_exceptions WHERE id=c AND state='open' AND refund_id=rid AND assigned_to='00000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'pending refund closed or owner lost'; END IF;
 BEGIN PERFORM public.update_event_order_exception(c,'00000000-0000-0000-0000-000000000001',v,'resolve',NULL,'Pickup confirmed but refund is pending'); EXCEPTION WHEN OTHERS THEN err:=SQLERRM; END;
 IF err IS DISTINCT FROM 'event_exception_obligation_outstanding' THEN RAISE EXCEPTION 'pending refund manually resolved: %',err; END IF;
 UPDATE public.refunds SET status='processed' WHERE id=rid;
 IF NOT EXISTS(SELECT 1 FROM public.event_order_exceptions WHERE id=c AND state='resolved' AND resolution_code='refunded') THEN RAISE EXCEPTION 'successful refund did not close and classify case'; END IF;
END $$;

DO $$ DECLARE oid uuid; outlet uuid; before_sen bigint; BEGIN
 INSERT INTO public.outlets(vendor_id,name,slug) VALUES('11111111-1111-4111-8111-111111111111','Ordinary shop fixture','ordinary-shop-fixture') RETURNING id INTO outlet;
 INSERT INTO public.orders(user_id,status,subtotal,discount_amount,total_amount,payment_method,paid_at) VALUES('00000000-0000-0000-0000-000000000004','paid',12,0,12,'mock_card',now()) RETURNING id INTO oid;
 INSERT INTO public.order_items(order_id,vendor_id,outlet_id,product_name,unit_price,quantity,line_total,fulfil_status) VALUES(oid,'11111111-1111-4111-8111-111111111111',outlet,'Ordinary product',12,1,12,'pending');
 SELECT earnings_sen INTO before_sen FROM public.wallets WHERE user_id='00000000-0000-0000-0000-000000000002';
 PERFORM public.settle_order_vendor_earnings(oid);
 UPDATE public.order_settlements SET hold_until=now()-interval '1 day' WHERE order_id=oid;
 PERFORM public.clear_matured_vendor_settlements(false);
 IF NOT EXISTS(SELECT 1 FROM public.order_settlements WHERE order_id=oid AND status='confirmed') OR (SELECT earnings_sen FROM public.wallets WHERE user_id='00000000-0000-0000-0000-000000000002')<=before_sen THEN RAISE EXCEPTION 'ordinary shop clearance changed'; END IF;
END $$;

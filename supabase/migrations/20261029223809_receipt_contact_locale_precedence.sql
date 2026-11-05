-- A registered customer's alternate receipt address may use the order's trusted
-- locale snapshot, but only when the paid order proves ownership and recipient.
CREATE OR REPLACE FUNCTION app_private.snapshot_recipient_email_locale() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE chosen text; matched boolean:=false; phase text; message text; details text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.status='sent' OR coalesce(to_jsonb(OLD)->>'delivery_state','')='unknown'
   OR coalesce(to_jsonb(NEW)->>'delivery_state','')='unknown' THEN RETURN NEW; END IF;
  IF OLD.payload->>'locale' IN ('en','zh-CN','ms') THEN
   NEW.payload:=coalesce(NEW.payload,'{}'::jsonb)||jsonb_build_object('locale',OLD.payload->>'locale');
   RETURN NEW;
  END IF;
 END IF;
 NEW.payload:=coalesce(NEW.payload,'{}'::jsonb);
 IF NEW.user_id IS NOT NULL THEN
  SELECT u.preferred_locale INTO chosen FROM public.users u WHERE u.id=NEW.user_id
   AND lower(btrim(u.email))=lower(btrim(NEW.to_email));
  IF FOUND THEN
   chosen:=app_private.normalize_email_locale(chosen);
  ELSE
   IF NEW.event_type='checkout_succeeded'
      AND coalesce(NEW.payload->>'receiptOrderId','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    SELECT o.contact_locale INTO chosen FROM public.orders o
     WHERE o.id=(NEW.payload->>'receiptOrderId')::uuid AND o.user_id=NEW.user_id
       AND lower(btrim(o.contact_email))=lower(btrim(NEW.to_email))
       AND o.status IN ('paid','completed');
    matched:=FOUND;
   END IF;
   IF NOT matched THEN chosen:='en'; END IF;
  END IF;
 ELSE
  IF coalesce(NEW.payload->>'reference','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
   SELECT o.contact_locale INTO chosen FROM public.orders o WHERE o.id=(NEW.payload->>'reference')::uuid
    AND o.user_id IS NULL AND o.guest_subject_id IS NOT NULL
    AND lower(btrim(o.contact_email))=lower(btrim(NEW.to_email));
   matched:=FOUND;
  END IF;
  IF NOT matched THEN
   SELECT CASE WHEN count(*)=1 THEN max(u.preferred_locale) ELSE NULL END INTO chosen
   FROM public.users u WHERE lower(btrim(u.email))=lower(btrim(NEW.to_email));
   IF chosen IS NULL THEN chosen:=NEW.payload->>'locale'; END IF;
  END IF;
 END IF;
 NEW.payload:=NEW.payload||jsonb_build_object('locale',app_private.normalize_email_locale(chosen));
 IF NEW.event_key LIKE 'vendor_exception:%' THEN
  phase:=split_part(NEW.event_key,':',3);
  message:=CASE phase
   WHEN 'payment_blocked' THEN 'Payment was received but this reservation cannot be fulfilled. Do not prepare or hand over goods. Admin is reviewing the payment.'
   WHEN 'pickup_review' THEN 'The pickup date has passed and collection is unconfirmed. Please verify whether your items were handed over and contact Admin with the actual outcome.'
   WHEN 'refund_pending' THEN 'A refund is under review or awaiting the payment provider. It has not been confirmed complete. Contact Admin before further fulfilment.'
   WHEN 'refund_attention' THEN 'A refund needs Admin attention. Completion has not been confirmed. Contact Admin before further fulfilment.'
   WHEN 'refunded' THEN 'The order refund has been confirmed complete. Review your order and settlement records.'
   WHEN 'collected' THEN 'Collection has been verified and the pickup exception is closed.'
   WHEN 'no_show' THEN 'Admin has verified non-collection and closed this pickup exception without a refund. This does not mean goods were handed over or funds are immediately available.' END;
  IF message IS NOT NULL AND left(NEW.payload->>'reason',length(message))=message THEN
   details:=btrim(substr(NEW.payload->>'reason',length(message)+1));
   NEW.payload:=NEW.payload||jsonb_build_object('reasonCode',phase,'reasonDetails',details);
  END IF;
 END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION app_private.snapshot_recipient_email_locale() FROM PUBLIC,anon,authenticated,service_role;

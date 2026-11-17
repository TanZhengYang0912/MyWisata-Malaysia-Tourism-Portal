-- Drop the account language preference. The page language is the browser's
-- choice only, and every system email is English, so nothing reads a saved
-- locale any more. Signatures, SECURITY and search_path of the replaced
-- functions are unchanged; CREATE OR REPLACE keeps their owners and grants.
-- Existing email_outbox rows may still carry payload.locale; the sender
-- ignores the key, so they are left as they are.

-- 1. Mail and checkout readers: no locale reads, no locale payload key.

CREATE OR REPLACE FUNCTION app_private.queue_order_receipt(p_order_id uuid, p_request_hour bigint DEFAULT NULL::bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE o public.orders%ROWTYPE; recipient text; recipient_name text; mail_key text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status NOT IN ('paid','completed') THEN RETURN false; END IF;
  IF p_request_hour IS NOT NULL AND p_request_hour <> floor(extract(epoch FROM now())/3600)::bigint THEN RETURN false; END IF;
  IF o.user_id IS NULL THEN
    IF o.guest_subject_id IS NULL THEN RETURN false; END IF;
    mail_key := CASE WHEN p_request_hour IS NULL THEN 'guest-order-confirmation:'||o.id ELSE 'guest-receipt:'||o.id||':'||p_request_hour END;
    PERFORM public.queue_guest_order_access(o.id,mail_key,NULL);
    RETURN EXISTS(SELECT 1 FROM public.email_outbox WHERE event_key=mail_key);
  END IF;
  SELECT coalesce(nullif(btrim(o.contact_email),''),nullif(btrim(u.email),'')),
    coalesce(nullif(o.contact_name,''),u.full_name)
  INTO recipient,recipient_name FROM public.users u WHERE u.id=o.user_id;
  -- Do not introduce a new purchase eligibility rule for legacy missing contacts.
  IF recipient IS NULL THEN RETURN false; END IF;
  mail_key := CASE WHEN p_request_hour IS NULL THEN 'order-receipt:'||o.id ELSE 'order-receipt-request:'||o.id||':'||p_request_hour END;
  INSERT INTO public.email_outbox(event_key,user_id,to_email,event_type,payload,status,next_attempt_at)
  VALUES(mail_key,o.user_id,recipient,'checkout_succeeded',
    jsonb_build_object('receiptOrderId',o.id,'reference',o.id,
      'recipientName',recipient_name,'amountRm',o.total_amount,'occurredAt',coalesce(o.paid_at,now())),
    'pending',now()) ON CONFLICT(event_key) DO NOTHING;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.queue_catalogue_review_notices()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  recipient public.users%ROWTYPE;
  vendor public.vendors%ROWTYPE;
  action_name text;
  notice_body text;
  notice_title text;
  notice_link text;
  notice_key text;
BEGIN
  IF NEW.action IS NULL OR NEW.action NOT IN ('approved', 'rejected', 'change_requested') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO vendor FROM public.vendors WHERE id = NEW.vendor_id AND status = 'approved';
  IF NOT FOUND OR vendor.owner_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO recipient FROM public.users WHERE id = vendor.owner_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  action_name := CASE NEW.action
    WHEN 'approved' THEN 'approve'
    WHEN 'rejected' THEN 'reject'
    WHEN 'change_requested' THEN 'change_requested'
  END;
  notice_title := 'Listing ' || CASE NEW.action
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    ELSE 'changes requested'
  END;
  notice_body := 'Your ' || NEW.entity_type || ' review was ' || CASE NEW.action
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    ELSE 'returned for changes'
  END || CASE WHEN nullif(btrim(NEW.note), '') IS NULL
    THEN '.' ELSE ': ' || btrim(NEW.note) END;
  notice_link := CASE WHEN NEW.entity_type IN ('outlet', 'hotel_profile')
    THEN '/vendor/outlets' ELSE '/vendor/products' END;
  notice_key := 'listing:review:' || NEW.id || ':' || recipient.id;

  INSERT INTO public.notifications(user_id, vendor_id, outlet_id, audience_role, type, title, body, link, category, metadata, event_key)
  VALUES(recipient.id, NEW.vendor_id, NULL, 'vendor_owner', 'vendor_listing_' || action_name,
    notice_title, notice_body, notice_link, 'vendor_products',
    jsonb_build_object('entityType', NEW.entity_type, 'status', NEW.action, 'reviewId', NEW.id), notice_key)
  ON CONFLICT(event_key) WHERE event_key IS NOT NULL DO NOTHING;

  IF nullif(btrim(recipient.email), '') IS NOT NULL THEN
    INSERT INTO public.email_outbox(event_key, user_id, to_email, event_type, payload, status, next_attempt_at)
    VALUES(notice_key, recipient.id, btrim(recipient.email), 'vendor_listing_review',
      jsonb_build_object('recipientName', recipient.full_name,
        'vendorName', vendor.name, 'reason', notice_body, 'reference', NEW.entity_id, 'occurredAt', NEW.created_at),
      'pending', now())
    ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.queue_recommendation_review_mail()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE recipient public.users%ROWTYPE; vendor_name text;
BEGIN
  IF NEW.action <> 'approve' OR NEW.to_status <> 'approved' THEN RETURN NEW; END IF;
  SELECT * INTO recipient FROM public.users WHERE id = NEW.recommender_id;
  -- Email remains optional for a legacy account without a contact address.
  IF NOT FOUND OR nullif(btrim(recipient.email), '') IS NULL THEN RETURN NEW; END IF;
  SELECT r.vendor_name INTO vendor_name FROM public.vendor_recommendations r WHERE r.id = NEW.recommendation_id;
  INSERT INTO public.email_outbox(event_key,user_id,to_email,event_type,payload,status,next_attempt_at)
  VALUES('recommendation_approved:' || NEW.recommendation_id,recipient.id,btrim(recipient.email),'recommendation_approved',
    jsonb_build_object('recipientName',recipient.full_name,
      'vendorName',vendor_name,'occurredAt',NEW.created_at),'pending',now())
  ON CONFLICT(event_key) DO NOTHING;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION app_private.queue_withdrawal_customer_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_email text;
  v_name text;
  v_payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status IN ('pending', 'pending_second_approval') THEN
    SELECT nullif(btrim(account.email), ''), account.full_name
      INTO v_email, v_name
      FROM public.users AS account
     WHERE account.id = NEW.user_id;
    IF v_email IS NULL THEN RAISE EXCEPTION 'withdrawal_email_recipient_unavailable'; END IF;
    v_payload := jsonb_build_object(
      'recipientName', v_name,
      'reference', NEW.id::text,
      'amountRm', NEW.amount,
      'occurredAt', now()::text
    );
    INSERT INTO public.email_outbox(event_key, user_id, to_email, event_type, payload, status, next_attempt_at)
    VALUES ('withdrawal_submitted:' || NEW.id::text, NEW.user_id, v_email,
      'withdrawal_submitted', v_payload, 'pending', now())
    ON CONFLICT (event_key) DO NOTHING;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'processing' THEN
    -- New requests use the exact recipient snapshot created at submission.
    -- Legacy rows fall back to the current account profile.
    SELECT sent_mail.to_email, sent_mail.payload ->> 'recipientName'
      INTO v_email, v_name
      FROM public.email_outbox AS sent_mail
     WHERE sent_mail.event_key = 'withdrawal_submitted:' || NEW.id::text;
    IF v_email IS NULL THEN
      SELECT nullif(btrim(account.email), ''), account.full_name
        INTO v_email, v_name
        FROM public.users AS account
       WHERE account.id = NEW.user_id;
    END IF;
    IF v_email IS NULL THEN RAISE EXCEPTION 'withdrawal_email_recipient_unavailable'; END IF;
    v_payload := jsonb_build_object(
      'recipientName', v_name,
      'reference', NEW.id::text,
      'amountRm', NEW.amount,
      'occurredAt', now()::text
    );
    INSERT INTO public.email_outbox(event_key, user_id, to_email, event_type, payload, status, next_attempt_at)
    VALUES ('withdrawal_approved:' || NEW.id::text, NEW.user_id, v_email,
      'withdrawal_approved', v_payload, 'pending', now())
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_guest_order_access(p_order_id uuid, p_event_key text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_order public.orders%ROWTYPE; v_token TEXT;
BEGIN
 SELECT * INTO v_order FROM public.orders WHERE id=p_order_id AND user_id IS NULL AND guest_subject_id IS NOT NULL FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.email_outbox WHERE event_key=p_event_key) THEN RETURN; END IF;
 v_token:=rtrim(translate(encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=');
 INSERT INTO public.guest_order_access_tokens(order_id,token_hash,expires_at) VALUES(p_order_id,encode(extensions.digest(v_token,'sha256'),'hex'),now()+interval '7 days');
 INSERT INTO public.email_outbox(event_key,user_id,to_email,event_type,payload,status,next_attempt_at)
 VALUES(p_event_key,NULL,v_order.contact_email,'checkout_succeeded',jsonb_build_object('receiptOrderId',CASE WHEN p_reason IS NULL OR p_event_key LIKE 'guest-receipt:%' THEN v_order.id ELSE NULL END,'recipientName',v_order.contact_name,'amountRm',v_order.total_amount,'reference',v_order.id,'occurredAt',now(),'reason',p_reason,'guestAccessToken',v_token),'pending',now());
END; $function$;

CREATE OR REPLACE FUNCTION public.guest_prepare_checkout(p_cart_id uuid, p_selected_item_ids uuid[], p_idempotency_key text, p_request_hash text, p_payment_method text, p_subtotal numeric, p_discount numeric, p_total numeric, p_voucher_code text, p_lines jsonb, p_guest_subject_id uuid, p_contact jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$BEGIN RETURN public.checkout_transaction_core(p_cart_id,p_selected_item_ids,p_idempotency_key,p_request_hash,p_payment_method,p_subtotal,p_discount,p_total,p_voucher_code,p_lines,NULL,p_guest_subject_id,p_contact); END;$function$;

CREATE OR REPLACE FUNCTION public.guest_prepare_event_checkout(p_listing_id uuid, p_pickup_date date, p_slot_id uuid, p_quantity integer, p_payment_method text, p_idempotency_key text, p_request_hash text, p_guest_subject_id uuid, p_contact jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$BEGIN RETURN public.event_checkout_transaction_core(p_listing_id,p_pickup_date,p_slot_id,p_quantity,p_payment_method,p_idempotency_key,p_request_hash,NULL,p_guest_subject_id,p_contact); END;$function$;

CREATE OR REPLACE FUNCTION app_private.deliver_withdrawal_approver_notifications(p_id uuid, p_cycle integer, p_stage text, p_token uuid, p_cursor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  job app_private.withdrawal_approver_jobs%ROWTYPE;
  withdrawal public.withdrawal_requests%ROWTYPE;
  recipients jsonb;
  stage_suffix text;
  notification_type text;
  notification_key_prefix text;
  notification_title text;
  notification_body text;
BEGIN
  PERFORM app_private.require_kyc_job_service();
  SELECT * INTO withdrawal FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE app_private.withdrawal_approver_jobs SET completed = true, token = NULL, lease_until = NULL
     WHERE withdrawal_id = p_id AND cycle = p_cycle AND stage = p_stage AND token = p_token AND cursor_id IS NOT DISTINCT FROM p_cursor;
    RETURN jsonb_build_object('stale', true, 'recipients', '[]'::jsonb);
  END IF;

  SELECT * INTO job FROM app_private.withdrawal_approver_jobs
   WHERE withdrawal_id = p_id AND cycle = p_cycle AND stage = p_stage
     AND token = p_token AND cursor_id IS NOT DISTINCT FROM p_cursor AND lease_until > now() AND NOT completed
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('stale', true, 'recipients', '[]'::jsonb); END IF;

  IF withdrawal.status IS DISTINCT FROM p_stage OR coalesce(withdrawal.approval_cycle, 1) IS DISTINCT FROM p_cycle THEN
    UPDATE app_private.withdrawal_approver_jobs SET completed = true, token = NULL, lease_until = NULL
     WHERE withdrawal_id = p_id AND cycle = p_cycle AND stage = p_stage AND token = p_token;
    RETURN jsonb_build_object('stale', true, 'recipients', '[]'::jsonb);
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(batch)), '[]'::jsonb) INTO recipients
    FROM (
      SELECT users.id, users.email, users.full_name
        FROM public.users
       WHERE users.id <> withdrawal.user_id
         AND (p_cursor IS NULL OR users.id > p_cursor)
         AND users.status = 'active'
         AND (CASE WHEN p_stage = 'overdue'
              THEN EXISTS (
                SELECT 1 FROM public.user_roles AS assignment
                JOIN public.roles AS role_row ON role_row.id = assignment.role_id
                WHERE assignment.user_id = users.id
                  AND assignment.vendor_id IS NULL
                  AND assignment.outlet_id IS NULL
                  AND role_row.name = 'super_admin'
              )
              ELSE EXISTS (
                SELECT 1 FROM public.user_roles
                 WHERE user_roles.user_id = users.id AND user_roles.vendor_id IS NULL AND user_roles.outlet_id IS NULL
              ) AND public.has_staff_permission(users.id, 'admin.withdrawal.approve')
             END)
       ORDER BY users.id LIMIT 25
    ) AS batch;

  stage_suffix := CASE WHEN p_stage = 'pending_second_approval' THEN ':stage:second' ELSE '' END;
  notification_type := CASE WHEN p_stage = 'overdue' THEN 'withdrawal_overdue' ELSE 'withdrawal_approval_task' END;
  notification_key_prefix := CASE WHEN p_stage = 'overdue' THEN 'withdrawal_overdue:' ELSE 'withdrawal_submitted:' END;
  notification_title := CASE WHEN p_stage = 'overdue' THEN 'Withdrawal review is overdue' ELSE 'Withdrawal awaiting review' END;
  notification_body := CASE WHEN p_stage = 'overdue'
    THEN 'An overdue withdrawal needs Super Admin attention in the protected Admin workspace.'
    ELSE 'A withdrawal review task is waiting. Open the protected Admin page to review it.' END;

  INSERT INTO public.notifications(user_id, type, title, body, link, category, event_key, metadata)
  SELECT recipient.id, notification_type, notification_title, notification_body,
         '/admin/withdrawals/' || p_id::text, 'wallet',
         notification_key_prefix || p_id::text || ':cycle:' || p_cycle::text || ':approver:' || recipient.id::text || stage_suffix,
         jsonb_build_object('withdrawal_id', p_id, 'approval_cycle', p_cycle)
    FROM jsonb_to_recordset(recipients) AS recipient(id uuid)
  ON CONFLICT (event_key) DO NOTHING;

  RETURN jsonb_build_object('stale', false, 'recipients', recipients);
END;
$function$;

-- 2. Approver recipients (returns jsonb, so CREATE OR REPLACE is enough).

CREATE OR REPLACE FUNCTION app_private.withdrawal_approver_recipients(p_customer uuid, p_after uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM app_private.require_kyc_job_service();
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(recipients))
    FROM (
      SELECT users.id, users.email, users.full_name
      FROM public.users
      WHERE users.id <> p_customer
        AND (p_after IS NULL OR users.id > p_after)
        AND users.status = 'active'
        AND EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_roles.user_id = users.id
            AND user_roles.vendor_id IS NULL
            AND user_roles.outlet_id IS NULL
        )
        AND public.has_staff_permission(users.id, 'admin.withdrawal.approve')
      ORDER BY users.id
      LIMIT 25
    ) recipients
  ), '[]'::jsonb);
END;
$function$;

-- 3. Live-only reader with no repo caller: keep its output columns so an
-- outside caller does not break; the language column is always NULL now.

CREATE OR REPLACE FUNCTION app_private.read_trip_weather_reminder_page(p_from date, p_through date, p_after_date date, p_after_trip_id text, p_limit integer)
 RETURNS TABLE(trip_id text, trip_name text, user_id uuid, user_email text, email_verified_at timestamp with time zone, preferred_locale text, scheduled_date date, item_label text, latitude double precision, longitude double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
  WITH day_keys AS (
    SELECT ti.scheduled_date, ti.trip_id
    FROM public.trip_items ti
    JOIN public.trips t ON t.id = ti.trip_id
    JOIN public.users u ON u.id = t.user_id
    WHERE ti.scheduled_date BETWEEN p_from AND p_through
      AND t.start_date IS NOT NULL AND t.end_date IS NOT NULL AND u.status = 'active'
      AND (p_after_date IS NULL OR (ti.scheduled_date, ti.trip_id) > (p_after_date, p_after_trip_id))
      AND EXISTS (
        SELECT 1 FROM public.trip_items located
        WHERE located.trip_id = ti.trip_id AND located.scheduled_date = ti.scheduled_date
          AND located.lat BETWEEN -90 AND 90 AND located.lng BETWEEN -180 AND 180
      )
    GROUP BY ti.scheduled_date, ti.trip_id
    ORDER BY ti.scheduled_date, ti.trip_id
    LIMIT GREATEST(1, LEAST(p_limit, 21))
  )
  SELECT t.id, t.name, t.user_id, u.email, u.email_verified_at,
    NULL::text, days.scheduled_date, anchor.label, anchor.lat, anchor.lng
  FROM day_keys days
  JOIN public.trips t ON t.id = days.trip_id
  JOIN public.users u ON u.id = t.user_id
  CROSS JOIN LATERAL (
    SELECT ti.label, ti.lat, ti.lng
    FROM public.trip_items ti
    WHERE ti.trip_id = days.trip_id AND ti.scheduled_date = days.scheduled_date
      AND ti.lat BETWEEN -90 AND 90 AND ti.lng BETWEEN -180 AND 180
    ORDER BY ti.sequence, ti.id
    LIMIT 1
  ) anchor
  ORDER BY days.scheduled_date, days.trip_id;
$function$;

-- 4. Locale triggers, their functions, the account RPC and the helper.
-- snapshot_recipient_email_locale also added reasonCode/reasonDetails to
-- vendor_exception rows only for translation; payload.reason already holds
-- the full English text.

DROP TRIGGER IF EXISTS initialize_profile_email_locale ON public.users;
DROP TRIGGER IF EXISTS project_auth_email_locale ON public.users;
DROP TRIGGER IF EXISTS snapshot_order_email_locale ON public.orders;
DROP TRIGGER IF EXISTS snapshot_recipient_email_locale ON public.email_outbox;

DROP FUNCTION IF EXISTS app_private.initialize_profile_email_locale();
DROP FUNCTION IF EXISTS app_private.project_auth_email_locale();
DROP FUNCTION IF EXISTS app_private.snapshot_order_email_locale();
DROP FUNCTION IF EXISTS app_private.snapshot_recipient_email_locale();
DROP FUNCTION IF EXISTS public.set_my_preferred_locale(text);
DROP FUNCTION IF EXISTS app_private.normalize_email_locale(text);

-- 5. Columns (their CHECK constraints go with them).

ALTER TABLE public.users DROP COLUMN IF EXISTS preferred_locale;
ALTER TABLE public.orders DROP COLUMN IF EXISTS contact_locale;

-- 6. Auth metadata key that only selected the Auth mail language.

UPDATE auth.users
   SET raw_user_meta_data = raw_user_meta_data - 'preferred_locale'
 WHERE raw_user_meta_data ? 'preferred_locale';

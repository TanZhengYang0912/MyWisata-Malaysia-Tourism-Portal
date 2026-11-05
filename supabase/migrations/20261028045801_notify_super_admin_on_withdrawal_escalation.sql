-- Reuse the existing leased, checkpointed notification outbox for overdue
-- withdrawals. The escalation function already atomically changes status to
-- `overdue`; its existing row trigger creates one durable intent per cycle.
ALTER TABLE app_private.withdrawal_approver_jobs
  DROP CONSTRAINT withdrawal_approver_jobs_stage_check,
  ADD CONSTRAINT withdrawal_approver_jobs_stage_check
    CHECK (stage IN ('pending', 'pending_second_approval', 'overdue'));

CREATE OR REPLACE FUNCTION app_private.withdrawal_approver_intent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status IN ('pending', 'pending_second_approval', 'overdue') THEN
    INSERT INTO app_private.withdrawal_approver_jobs (withdrawal_id, cycle, stage)
    VALUES (NEW.id, coalesce(NEW.approval_cycle, 1), NEW.status)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.deliver_withdrawal_approver_notifications(
  p_id uuid,
  p_cycle integer,
  p_stage text,
  p_token uuid,
  p_cursor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
      SELECT users.id, users.email, users.full_name, users.preferred_locale
        FROM public.users
       WHERE users.id <> withdrawal.user_id
         AND (p_cursor IS NULL OR users.id > p_cursor)
         AND users.status = 'active'
         AND (CASE WHEN p_stage = 'overdue'
              THEN public.is_super_admin(users.id)
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
$$;

NOTIFY pgrst, 'reload schema';

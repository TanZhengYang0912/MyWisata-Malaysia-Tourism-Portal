-- A processed refund is an authoritative resolution disposition, not merely
-- a closed operational row. Affiliate clearing uses resolution_code to decide
-- whether an order exception still blocks release.
CREATE OR REPLACE FUNCTION app_private.track_event_refund_attention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id=NEW.order_id AND event_location_id IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_order_exceptions
    WHERE payment_id=NEW.payment_id AND kind='payment_unfulfillable'
  ) THEN
    UPDATE public.event_order_exceptions
    SET refund_id=NEW.id
    WHERE payment_id=NEW.payment_id AND kind='payment_unfulfillable';
  END IF;

  IF NEW.status='approved'
    OR (NEW.status='pending' AND (
      NEW.refund_scope='event_payment_compensation'
      OR EXISTS (
        SELECT 1 FROM public.order_items
        WHERE order_id=NEW.order_id
          AND event_location_id IS NOT NULL
          AND fulfil_status='cancelled'
      )
    ))
    OR NEW.provider_failure_code IS NOT NULL
    OR (NEW.provider_refund_id IS NOT NULL AND NEW.status<>'processed') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.event_order_exceptions
      WHERE refund_id=NEW.id AND state='open'
    ) THEN
      INSERT INTO public.event_order_exceptions(
        source_key,kind,order_id,payment_id,refund_id,reason_code
      )
      VALUES (
        'event-refund:'||NEW.payment_id,
        'refund_attention',
        NEW.order_id,
        NEW.payment_id,
        NEW.id,
        CASE
          WHEN NEW.provider_failure_code IS NOT NULL OR NEW.status='rejected'
            THEN 'refund_failed'
          ELSE 'refund_review_required'
        END
      )
      ON CONFLICT(source_key) DO UPDATE
      SET refund_id=EXCLUDED.refund_id,
          reason_code=EXCLUDED.reason_code,
          version=event_order_exceptions.version+1,
          updated_at=now()
      WHERE event_order_exceptions.state='open'
        AND event_order_exceptions.refund_id IS DISTINCT FROM EXCLUDED.refund_id;
    END IF;
  END IF;

  -- Keep completed provider evidence visible and explicitly classified.
  IF NEW.status='processed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.event_order_exceptions
    SET state='resolved',
        resolution_code='refunded',
        resolved_at=now(),
        resolution_note='Refund completion verified',
        version=version+1,
        updated_at=now()
    WHERE state='open'
      AND (refund_id=NEW.id OR (NEW.payment_id IS NOT NULL AND payment_id=NEW.payment_id));
  END IF;

  RETURN NEW;
END;
$$;

-- Safely repair historical rows only when a processed provider refund is the
-- evidence that already caused the exception to close.
UPDATE public.event_order_exceptions AS e
SET resolution_code='refunded',
    version=e.version+1,
    updated_at=now()
FROM public.refunds AS r
WHERE r.id=e.refund_id
  AND r.status='processed'
  AND e.state='resolved'
  AND e.resolution_code IS NULL;

NOTIFY pgrst,'reload schema';

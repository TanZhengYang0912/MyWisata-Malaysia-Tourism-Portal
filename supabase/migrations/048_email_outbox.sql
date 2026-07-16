-- Transactional email outbox. Only the server service role can read/process rows.
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'checkout_succeeded', 'topup_succeeded',
    'withdrawal_submitted', 'withdrawal_approved', 'withdrawal_paid',
    'withdrawal_failed', 'withdrawal_rejected'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_outbox_pending_idx
  ON public.email_outbox (status, next_attempt_at, created_at);

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_outbox_service_only ON public.email_outbox;
CREATE POLICY email_outbox_service_only ON public.email_outbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.claim_email_outbox(p_limit INTEGER DEFAULT 20)
RETURNS SETOF public.email_outbox
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH candidates AS (
    SELECT id
    FROM public.email_outbox
    WHERE status IN ('pending', 'failed')
      AND attempts < 3
      AND next_attempt_at <= now()
    ORDER BY created_at
    LIMIT GREATEST(1, LEAST(p_limit, 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_outbox AS e
     SET status = 'sending',
         attempts = e.attempts + 1,
         updated_at = now()
    FROM candidates
   WHERE e.id = candidates.id
  RETURNING e.*;
$$;

REVOKE ALL ON FUNCTION public.claim_email_outbox(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_outbox(INTEGER) TO service_role;

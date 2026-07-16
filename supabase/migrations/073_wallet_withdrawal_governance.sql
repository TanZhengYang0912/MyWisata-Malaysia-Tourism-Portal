-- Wallet and withdrawal governance foundation.
-- Additive only: existing wallet amounts and historical requests are preserved.

ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS reserved_earnings_sen BIGINT NOT NULL DEFAULT 0
    CHECK (reserved_earnings_sen >= 0),
  ADD COLUMN IF NOT EXISTS withdrawn_earnings_sen BIGINT NOT NULL DEFAULT 0
    CHECK (withdrawn_earnings_sen >= 0);

-- Historical requests already deducted earnings when submitted. Backfill only the
-- reserved projection, never deduct earnings a second time.
UPDATE public.wallets w
SET reserved_earnings_sen = active.total_sen
FROM (
  SELECT wallet_id, SUM(ROUND(amount * 100))::BIGINT AS total_sen
  FROM public.withdrawal_requests
  WHERE status IN ('pending', 'approved', 'processing')
  GROUP BY wallet_id
) active
WHERE active.wallet_id = w.id
  AND w.reserved_earnings_sen = 0;

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS overdue_from_status TEXT,
  ADD COLUMN IF NOT EXISTS customer_reason TEXT,
  ADD COLUMN IF NOT EXISTS customer_visible_at TIMESTAMPTZ;

ALTER TABLE public.withdrawal_requests
  DROP CONSTRAINT IF EXISTS withdrawal_requests_status_check;

ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_status_check
  CHECK (status IN (
    'pending', 'pending_second_approval', 'approved', 'processing',
    'hold', 'overdue', 'rejected', 'paid', 'completed', 'failed'
  ));

-- A user may have one request that still holds funds or awaits review.
CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_requests_one_active_per_user
  ON public.withdrawal_requests (user_id)
  WHERE status IN ('pending', 'pending_second_approval', 'approved', 'processing', 'hold', 'overdue');

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_user_idempotency_key
  ON public.wallet_transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_type_check,
  DROP CONSTRAINT IF EXISTS wallet_transactions_bucket_check,
  DROP CONSTRAINT IF EXISTS wt_bucket_type_consistent;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN (
    'topup', 'spend', 'earnings',
    'withdrawal_reserve', 'withdrawal_complete', 'withdrawal_cancel',
    'earnings_pending', 'earnings_confirm', 'earnings_reverse',
    'refund', 'adjustment_credit', 'adjustment_debit'
  )),
  ADD CONSTRAINT wallet_transactions_bucket_check
  CHECK (bucket IN ('topup', 'earnings', 'pending_earnings')),
  ADD CONSTRAINT wt_bucket_type_consistent
  CHECK (
    (type = 'topup'               AND bucket = 'topup') OR
    (type = 'spend'               AND bucket IN ('topup', 'earnings')) OR
    (type = 'earnings'            AND bucket = 'earnings') OR
    (type = 'withdrawal_reserve'  AND bucket = 'earnings') OR
    (type = 'withdrawal_complete' AND bucket = 'earnings') OR
    (type = 'withdrawal_cancel'   AND bucket = 'earnings') OR
    (type = 'earnings_pending'    AND bucket = 'pending_earnings') OR
    (type = 'earnings_confirm'    AND bucket IN ('earnings', 'pending_earnings')) OR
    (type = 'earnings_reverse'    AND bucket = 'pending_earnings') OR
    (type = 'refund'              AND bucket IN ('topup', 'earnings')) OR
    (type = 'adjustment_credit'   AND bucket IN ('topup', 'earnings')) OR
    (type = 'adjustment_debit'    AND bucket IN ('topup', 'earnings'))
  );

INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('wallet.clearance_days', '7', 'Reward clearance window in days for new rewards'),
  ('withdrawal.min_amount_sen', '5000', 'Minimum withdrawal in sen'),
  ('withdrawal.dual_approval_threshold_sen', '50000', 'Withdrawal amount requiring two approvers in sen'),
  ('withdrawal.escalation_hours', '48', 'Hours before a pending withdrawal becomes overdue'),
  ('withdrawal.hold_escalation_hours', '168', 'Hours before a held withdrawal becomes overdue')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.wallet_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  wallet_transaction_id UUID NOT NULL REFERENCES public.wallet_transactions(id),
  actor_id UUID NOT NULL REFERENCES public.users(id),
  reason TEXT NOT NULL CHECK (char_length(BTRIM(reason)) >= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.withdrawal_risk_assessments (
  withdrawal_id UUID PRIMARY KEY REFERENCES public.withdrawal_requests(id) ON DELETE CASCADE,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'review', 'high')),
  snapshot JSONB NOT NULL,
  overridden_by UUID REFERENCES public.users(id),
  override_reason TEXT CHECK (override_reason IS NULL OR char_length(BTRIM(override_reason)) >= 10),
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  overridden_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.monthly_payout_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  summary JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by TEXT NOT NULL CHECK (generated_by IN ('scheduler', 'super_admin'))
);

ALTER TABLE public.wallet_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_payout_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_adjustments_admin_read ON public.wallet_adjustments;
CREATE POLICY wallet_adjustments_admin_read ON public.wallet_adjustments
  FOR SELECT USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS withdrawal_risk_assessments_approver_read ON public.withdrawal_risk_assessments;
CREATE POLICY withdrawal_risk_assessments_approver_read ON public.withdrawal_risk_assessments
  FOR SELECT USING (public.is_approver(auth.uid()));

DROP POLICY IF EXISTS monthly_payout_reports_super_admin_read ON public.monthly_payout_reports;
CREATE POLICY monthly_payout_reports_super_admin_read ON public.monthly_payout_reports
  FOR SELECT USING (public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS withdrawal_risk_assessments_level_idx
  ON public.withdrawal_risk_assessments (risk_level, assessed_at DESC);
CREATE INDEX IF NOT EXISTS monthly_payout_reports_period_idx
  ON public.monthly_payout_reports (period_start DESC);

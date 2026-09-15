-- Vendor order settlement + platform commission.
--
-- Until now nothing credited a vendor's wallet from a real paid order — only the
-- @demo.local-gated seed_demo_vendor_order_earning() RPC did, at the full line
-- total with no fee. Affiliate/recommendation commissions were paid to the
-- earner but debited from nobody. This wires the model Docs/design/deferred.md §4
-- specifies:
--
--   * On a paid order, each vendor is credited (line share of total_amount)
--     minus a platform commission (default 15%, configurable) into
--     pending_earnings_sen, held for wallet.clearance_days, then cleared to
--     earnings_sen — the exact lifecycle recommendation rewards already use.
--   * Affiliate + recommendation commissions are FUNDED FROM the platform's cut
--     (vendor net is unaffected by whether the order was referred). Per-order
--     platform_net = platform_fee - affiliate_payout - recommendation_payout,
--     surfaced (not blocked) in the admin reconciliation view; it can go
--     negative on a small order that triggered the RM50 first-sale bonus.
--
-- Deferred: seed_demo_vendor_order_earning() is left untouched (demo
-- scaffolding; the order_settlements unique key stops any double-credit).
-- Vendor-issued vouchers are shared pro-rata here like platform ones — a real
-- "who bears the discount" split is a later refinement.

-- ── 1. Settings + per-vendor rate override ──────────────────────────────────

INSERT INTO public.platform_settings (key, value, description)
VALUES ('commission.platform_rate', '0.15', 'Platform commission on each order line, as a 0..1 fraction. Vendor nets the rest; affiliate/recommendation payouts come out of this cut.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS platform_commission_rate NUMERIC(5,4)
    CHECK (platform_commission_rate IS NULL OR (platform_commission_rate >= 0 AND platform_commission_rate < 1));

COMMENT ON COLUMN public.vendors.platform_commission_rate IS
  'Negotiated per-vendor override for commission.platform_rate. NULL = use the global setting.';

-- ── 2. order_settlements ledger (one row per order x vendor) ─────────────────

CREATE TABLE IF NOT EXISTS public.order_settlements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id           UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  gross_sen           BIGINT NOT NULL CHECK (gross_sen >= 0),
  platform_rate       NUMERIC(5,4) NOT NULL,
  platform_fee_sen    BIGINT NOT NULL CHECK (platform_fee_sen >= 0),
  vendor_net_sen      BIGINT NOT NULL CHECK (vendor_net_sen >= 0),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','reversed')),
  hold_until          TIMESTAMPTZ,
  wallet_txn_id       UUID,
  reversed_amount_sen BIGINT NOT NULL DEFAULT 0 CHECK (reversed_amount_sen >= 0),
  confirmed_at        TIMESTAMPTZ,
  reversed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS order_settlements_vendor_idx ON public.order_settlements (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_settlements_status_hold_idx ON public.order_settlements (status, hold_until);
CREATE INDEX IF NOT EXISTS order_settlements_order_idx ON public.order_settlements (order_id);

ALTER TABLE public.order_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_settlements_read ON public.order_settlements;
CREATE POLICY order_settlements_read ON public.order_settlements
  FOR SELECT USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = order_settlements.vendor_id AND v.owner_id = auth.uid()
    )
  );
-- No INSERT/UPDATE/DELETE policy: writes only through the SECURITY DEFINER RPCs below.

-- ── 3. Clawback shortfall log (refund exceeded the vendor's spendable balance) ─

CREATE TABLE IF NOT EXISTS public.settlement_clawback_shortfalls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id    UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  shortfall_sen BIGINT NOT NULL CHECK (shortfall_sen > 0),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.settlement_clawback_shortfalls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settlement_clawback_shortfalls_admin_read ON public.settlement_clawback_shortfalls;
CREATE POLICY settlement_clawback_shortfalls_admin_read ON public.settlement_clawback_shortfalls
  FOR SELECT USING (public.is_admin(auth.uid()));

-- ── 4. settle_order_vendor_earnings — credit each vendor their held net ──────

CREATE OR REPLACE FUNCTION public.settle_order_vendor_earnings(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order        public.orders%ROWTYPE;
  v_total_sen    BIGINT;
  v_subtotal     NUMERIC;
  v_hold_days    INT;
  v_global_rate  NUMERIC;
  v_allocated    BIGINT := 0;
  v_settled      INT := 0;
  v_owner_id     UUID;
  v_wallet_id    UUID;
  v_rate         NUMERIC;
  v_gross_sen    BIGINT;
  v_fee_sen      BIGINT;
  v_net_sen      BIGINT;
  v_txn_id       UUID;
  v_settlement_id UUID;
  r              RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('settled', 0, 'reason', 'order_not_found'); END IF;
  IF LOWER(v_order.status) NOT IN ('paid', 'completed') THEN
    RETURN jsonb_build_object('settled', 0, 'reason', 'order_not_paid');
  END IF;

  v_total_sen := ROUND(v_order.total_amount * 100)::BIGINT;
  v_subtotal  := NULLIF(v_order.subtotal, 0);

  SELECT COALESCE(
    (SELECT NULLIF(value, '')::INT FROM public.platform_settings WHERE key = 'wallet.clearance_days'),
    (SELECT NULLIF(value, '')::INT FROM public.platform_settings WHERE key = 'earnings.hold_days'),
    7
  ) INTO v_hold_days;
  IF v_hold_days IS NULL OR v_hold_days < 1 OR v_hold_days > 30 THEN v_hold_days := 7; END IF;

  SELECT NULLIF(value, '')::NUMERIC INTO v_global_rate
    FROM public.platform_settings WHERE key = 'commission.platform_rate';
  IF v_global_rate IS NULL OR v_global_rate < 0 OR v_global_rate >= 1 THEN v_global_rate := 0.15; END IF;

  FOR r IN
    SELECT oi.vendor_id,
           SUM(oi.line_total) AS line_sum,
           ROW_NUMBER() OVER (ORDER BY oi.vendor_id) AS rn,
           COUNT(*) OVER () AS row_count
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.vendor_id IS NOT NULL
    GROUP BY oi.vendor_id
  LOOP
    -- Pro-rata share of the discounted order total; the last vendor absorbs the
    -- rounding remainder so SUM(gross_sen) = total_amount exactly.
    IF v_total_sen <= 0 OR v_subtotal IS NULL THEN
      v_gross_sen := 0;
    ELSIF r.rn = r.row_count THEN
      v_gross_sen := GREATEST(0, v_total_sen - v_allocated);
    ELSE
      v_gross_sen := ROUND(v_total_sen * (r.line_sum / v_subtotal))::BIGINT;
    END IF;
    v_allocated := v_allocated + v_gross_sen;

    v_rate := COALESCE(
      (SELECT platform_commission_rate FROM public.vendors WHERE id = r.vendor_id),
      v_global_rate
    );
    IF v_rate < 0 OR v_rate >= 1 THEN v_rate := v_global_rate; END IF;

    v_fee_sen := ROUND(v_gross_sen * v_rate)::BIGINT;
    v_net_sen := GREATEST(0, v_gross_sen - v_fee_sen);

    INSERT INTO public.order_settlements
      (order_id, vendor_id, gross_sen, platform_rate, platform_fee_sen, vendor_net_sen,
       status, hold_until)
    VALUES
      (p_order_id, r.vendor_id, v_gross_sen, v_rate, v_fee_sen, v_net_sen,
       'pending', now() + (v_hold_days || ' days')::INTERVAL)
    ON CONFLICT (order_id, vendor_id) DO NOTHING
    RETURNING id INTO v_settlement_id;

    IF v_settlement_id IS NULL THEN
      CONTINUE; -- already settled (idempotent)
    END IF;
    v_settled := v_settled + 1;

    IF v_net_sen <= 0 THEN
      CONTINUE; -- nothing to move (free reservation / fully-discounted line)
    END IF;

    SELECT owner_id INTO v_owner_id FROM public.vendors WHERE id = r.vendor_id;
    IF v_owner_id IS NULL THEN CONTINUE; END IF;

    SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = v_owner_id FOR UPDATE;
    IF v_wallet_id IS NULL THEN
      INSERT INTO public.wallets (user_id) VALUES (v_owner_id)
      ON CONFLICT (user_id) DO NOTHING;
      SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = v_owner_id FOR UPDATE;
    END IF;

    UPDATE public.wallets
       SET pending_earnings_sen = pending_earnings_sen + v_net_sen,
           updated_at = now()
     WHERE id = v_wallet_id;

    INSERT INTO public.wallet_transactions
      (user_id, wallet_id, order_id, idempotency_key, type, amount_sen, bucket, direction, note)
    VALUES
      (v_owner_id, v_wallet_id, p_order_id,
       'vendor-settlement:pending:' || p_order_id::TEXT || ':' || r.vendor_id::TEXT,
       'earnings_pending', v_net_sen, 'pending_earnings', 'credit',
       'Vendor order settlement (held)')
    ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_txn_id;

    UPDATE public.order_settlements SET wallet_txn_id = v_txn_id WHERE id = v_settlement_id;
  END LOOP;

  RETURN jsonb_build_object('settled', v_settled, 'order_id', p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_order_vendor_earnings(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_order_vendor_earnings(UUID) TO service_role;

-- ── 5. clear_matured_vendor_settlements — port of the recommendation clearer ──

CREATE OR REPLACE FUNCTION public.clear_matured_vendor_settlements(p_ignore_hold BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  settlement_id   UUID,
  vendor_owner_id UUID,
  order_id        UUID,
  action          TEXT,
  amount_sen      BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row       RECORD;
  v_wallet_id UUID;
  v_pending   BIGINT;
  v_amount    BIGINT;
  v_txn_id    UUID;
BEGIN
  FOR v_row IN
    SELECT s.id, s.order_id, s.vendor_net_sen, s.reversed_amount_sen,
           v.owner_id,
           LOWER(COALESCE(o.status, '')) AS order_status
    FROM public.order_settlements s
    JOIN public.vendors v ON v.id = s.vendor_id
    LEFT JOIN public.orders o ON o.id = s.order_id
    WHERE s.status = 'pending'
      AND (
        LOWER(COALESCE(o.status, '')) IN ('cancelled', 'refunded')
        OR p_ignore_hold
        OR (s.hold_until IS NOT NULL AND s.hold_until <= now())
      )
    ORDER BY s.hold_until NULLS FIRST, s.id
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    settlement_id := v_row.id;
    vendor_owner_id := v_row.owner_id;
    order_id := v_row.order_id;
    v_amount := GREATEST(0, v_row.vendor_net_sen - v_row.reversed_amount_sen);
    amount_sen := v_amount;

    IF v_row.owner_id IS NULL THEN
      action := 'skipped_wallet'; RETURN NEXT; CONTINUE;
    END IF;

    SELECT id, pending_earnings_sen INTO v_wallet_id, v_pending
      FROM public.wallets WHERE user_id = v_row.owner_id FOR UPDATE;
    IF NOT FOUND THEN
      action := 'skipped_wallet'; RETURN NEXT; CONTINUE;
    END IF;

    IF v_row.order_status IN ('cancelled', 'refunded') THEN
      IF v_amount > 0 THEN
        IF v_pending < v_amount THEN
          RAISE EXCEPTION 'pending_wallet_balance_mismatch for order_settlement %', v_row.id;
        END IF;
        UPDATE public.wallets
           SET pending_earnings_sen = pending_earnings_sen - v_amount, updated_at = now()
         WHERE id = v_wallet_id;
        INSERT INTO public.wallet_transactions
          (user_id, wallet_id, order_id, type, amount_sen, bucket, direction, note)
        VALUES
          (v_row.owner_id, v_wallet_id, v_row.order_id, 'earnings_reverse', v_amount,
           'pending_earnings', 'debit', 'Vendor settlement reversed — order cancelled or refunded');
      END IF;
      UPDATE public.order_settlements
         SET status = 'reversed', reversed_at = now(),
             reversed_amount_sen = vendor_net_sen
       WHERE id = v_row.id AND status = 'pending';
      action := 'reversed'; RETURN NEXT; CONTINUE;
    END IF;

    -- Matured hold: move held -> spendable.
    IF v_amount > 0 THEN
      IF v_pending < v_amount THEN
        RAISE EXCEPTION 'pending_wallet_balance_mismatch for order_settlement %', v_row.id;
      END IF;
      UPDATE public.wallets
         SET pending_earnings_sen = pending_earnings_sen - v_amount,
             earnings_sen = earnings_sen + v_amount,
             updated_at = now()
       WHERE id = v_wallet_id;
      INSERT INTO public.wallet_transactions
        (user_id, wallet_id, order_id, type, amount_sen, bucket, direction, note)
      VALUES
        (v_row.owner_id, v_wallet_id, v_row.order_id, 'earnings_confirm', v_amount,
         'pending_earnings', 'debit', 'Vendor settlement hold cleared');
      INSERT INTO public.wallet_transactions
        (user_id, wallet_id, order_id, type, amount_sen, bucket, direction, note)
      VALUES
        (v_row.owner_id, v_wallet_id, v_row.order_id, 'earnings_confirm', v_amount,
         'earnings', 'credit', 'Vendor settlement available after hold period')
      RETURNING id INTO v_txn_id;
    END IF;

    UPDATE public.order_settlements
       SET status = 'confirmed', confirmed_at = now(),
           wallet_txn_id = COALESCE(v_txn_id, wallet_txn_id)
     WHERE id = v_row.id AND status = 'pending';
    action := 'cleared'; RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_matured_vendor_settlements(BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_matured_vendor_settlements(BOOLEAN) TO service_role;

-- ── 6. reverse_order_vendor_settlement — clawback for confirmed settlements ──
-- Pending settlements are handled by the clearer above (it sees the refunded
-- order). This covers already-cleared money and partial refunds.

CREATE OR REPLACE FUNCTION public.reverse_order_vendor_settlement(
  p_order_id UUID,
  p_refund_amount_sen BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_sen BIGINT;
  v_fraction  NUMERIC;
  v_reversed  INT := 0;
  v_row       RECORD;
  v_wallet_id UUID;
  v_pending   BIGINT;
  v_earnings  BIGINT;
  v_target    BIGINT;
  v_from_pending BIGINT;
  v_from_earnings BIGINT;
  v_shortfall BIGINT;
BEGIN
  SELECT ROUND(total_amount * 100)::BIGINT INTO v_total_sen FROM public.orders WHERE id = p_order_id;
  IF v_total_sen IS NULL OR v_total_sen <= 0 THEN
    RETURN jsonb_build_object('reversed', 0, 'reason', 'no_order_total');
  END IF;
  v_fraction := LEAST(1.0, GREATEST(0.0, COALESCE(p_refund_amount_sen, v_total_sen)::NUMERIC / v_total_sen));

  FOR v_row IN
    SELECT s.id, s.vendor_id, s.vendor_net_sen, s.reversed_amount_sen, s.status,
           v.owner_id
    FROM public.order_settlements s
    JOIN public.vendors v ON v.id = s.vendor_id
    WHERE s.order_id = p_order_id AND s.status IN ('pending', 'confirmed')
    FOR UPDATE OF s
  LOOP
    v_target := LEAST(
      GREATEST(0, ROUND(v_row.vendor_net_sen * v_fraction)::BIGINT),
      v_row.vendor_net_sen - v_row.reversed_amount_sen
    );
    IF v_target <= 0 OR v_row.owner_id IS NULL THEN CONTINUE; END IF;

    SELECT id, pending_earnings_sen, earnings_sen
      INTO v_wallet_id, v_pending, v_earnings
      FROM public.wallets WHERE user_id = v_row.owner_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_from_pending := 0;
    v_from_earnings := 0;
    IF v_row.status = 'pending' THEN
      v_from_pending := LEAST(v_target, v_pending);
    ELSE
      v_from_earnings := LEAST(v_target, v_earnings);
    END IF;
    v_shortfall := v_target - v_from_pending - v_from_earnings;

    IF v_from_pending > 0 THEN
      UPDATE public.wallets SET pending_earnings_sen = pending_earnings_sen - v_from_pending, updated_at = now() WHERE id = v_wallet_id;
      INSERT INTO public.wallet_transactions (user_id, wallet_id, order_id, type, amount_sen, bucket, direction, note)
      VALUES (v_row.owner_id, v_wallet_id, p_order_id, 'earnings_reverse', v_from_pending, 'pending_earnings', 'debit', 'Vendor settlement clawed back — order refunded');
    END IF;
    IF v_from_earnings > 0 THEN
      UPDATE public.wallets SET earnings_sen = earnings_sen - v_from_earnings, updated_at = now() WHERE id = v_wallet_id;
      INSERT INTO public.wallet_transactions (user_id, wallet_id, order_id, type, amount_sen, bucket, direction, note)
      VALUES (v_row.owner_id, v_wallet_id, p_order_id, 'adjustment_debit', v_from_earnings, 'earnings', 'debit', 'Vendor settlement clawed back — order refunded');
    END IF;
    IF v_shortfall > 0 THEN
      INSERT INTO public.settlement_clawback_shortfalls (order_id, vendor_id, shortfall_sen)
      VALUES (p_order_id, v_row.vendor_id, v_shortfall);
    END IF;

    UPDATE public.order_settlements
       SET reversed_amount_sen = reversed_amount_sen + v_target,
           status = CASE WHEN reversed_amount_sen + v_target >= vendor_net_sen THEN 'reversed' ELSE status END,
           reversed_at = CASE WHEN reversed_amount_sen + v_target >= vendor_net_sen THEN now() ELSE reversed_at END
     WHERE id = v_row.id;
    v_reversed := v_reversed + 1;
  END LOOP;

  RETURN jsonb_build_object('reversed', v_reversed, 'order_id', p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_order_vendor_settlement(UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_order_vendor_settlement(UUID, BIGINT) TO service_role;

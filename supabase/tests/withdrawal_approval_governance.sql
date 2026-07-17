-- withdrawal_approval_governance.sql
-- SQL assertion suite for 074 governance contracts.
-- Run in the Supabase SQL Editor (not as a migration).
-- Every DO block rolls back or raises on failure.

-- ── 1. Verify indexes exist ──────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'withdrawal_approvals_one_decision_per_actor'
  ), 'FAIL: withdrawal_approvals_one_decision_per_actor index missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'withdrawal_requests_review_queue_idx'
  ), 'FAIL: withdrawal_requests_review_queue_idx index missing';
END $$;

-- ── 2. Verify RPCs exist ─────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'assess_withdrawal_risk'
  ), 'FAIL: assess_withdrawal_risk function missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'override_withdrawal_risk'
  ), 'FAIL: override_withdrawal_risk function missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'approve_wallet_withdrawal'
  ), 'FAIL: approve_wallet_withdrawal function missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mark_withdrawal_processing'
  ), 'FAIL: mark_withdrawal_processing function missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'complete_withdrawal_payout'
  ), 'FAIL: complete_withdrawal_payout function missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'escalate_withdrawals'
  ), 'FAIL: escalate_withdrawals function missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'generate_monthly_payout_report'
  ), 'FAIL: generate_monthly_payout_report function missing';

  RAISE NOTICE 'PASS: All 074 RPCs exist';
END $$;

-- ── 3. Verify platform_settings keys exist ───────────────────────────────────
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'withdrawal.escalation_hours'),
    'FAIL: withdrawal.escalation_hours setting missing';
  ASSERT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'withdrawal.hold_escalation_hours'),
    'FAIL: withdrawal.hold_escalation_hours setting missing';
  ASSERT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'withdrawal.dual_approval_threshold_sen'),
    'FAIL: withdrawal.dual_approval_threshold_sen setting missing';
  RAISE NOTICE 'PASS: All required platform_settings keys present';
END $$;

-- ── 4. Contract: approve_wallet_withdrawal note length ───────────────────────
-- note_length_invalid must be raised for notes of 1-9 characters.
-- This block intentionally raises — run as a standalone check.
-- Uncomment to test note validation (requires a live withdrawal in 'pending' status):
/*
DO $$
DECLARE
  v_result JSONB;
BEGIN
  -- Replace 'YOUR-WITHDRAWAL-UUID' with an actual pending withdrawal id.
  BEGIN
    SELECT public.approve_wallet_withdrawal('YOUR-WITHDRAWAL-UUID', 'short', null) INTO v_result;
    RAISE EXCEPTION 'FAIL: note_length_invalid was not raised for a 5-char note';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM = 'note_length_invalid', 'FAIL: wrong exception: ' || SQLERRM;
    RAISE NOTICE 'PASS: note_length_invalid raised for short note';
  END;
END $$;
*/

-- ── 5. Contract: risk_not_high error from override ───────────────────────────
-- Requires a withdrawal with a 'low' risk assessment and a super_admin session.
-- Uncomment to test live:
/*
DO $$
DECLARE v_result JSONB;
BEGIN
  BEGIN
    SELECT public.override_withdrawal_risk('LOW-RISK-WITHDRAWAL-UUID', 'Ten or more chars reason here.', null) INTO v_result;
    RAISE EXCEPTION 'FAIL: risk_not_high was not raised';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM = 'risk_not_high', 'FAIL: wrong exception: ' || SQLERRM;
    RAISE NOTICE 'PASS: risk_not_high raised for non-high-risk withdrawal';
  END;
END $$;
*/

-- ── 6. Contract: escalate_withdrawals idempotency ────────────────────────────
DO $$
DECLARE
  v_result1 INT;
  v_result2 INT;
BEGIN
  -- Calling with a far-future timestamp should escalate nothing (no stale requests that far ahead).
  -- Calling twice at the same far-past timestamp should also not double-escalate already-overdue rows.
  SELECT public.escalate_withdrawals(now() - INTERVAL '1000 days') INTO v_result1;
  SELECT public.escalate_withdrawals(now() - INTERVAL '1000 days') INTO v_result2;
  ASSERT v_result2 = 0,
    'FAIL: escalate_withdrawals not idempotent — second call escalated ' || v_result2 || ' rows';
  RAISE NOTICE 'PASS: escalate_withdrawals is idempotent (second call = 0)';
END $$;

-- ── 7. Contract: generate_monthly_payout_report period uniqueness ────────────
DO $$
DECLARE
  v_r1 JSONB;
  v_r2 JSONB;
BEGIN
  -- Call for the same period twice. Both should succeed and return the same period_start.
  SELECT public.generate_monthly_payout_report('2020-01-01', 'scheduler') INTO v_r1;
  SELECT public.generate_monthly_payout_report('2020-01-01', 'scheduler') INTO v_r2;
  ASSERT (v_r1 ->> 'period_start') = (v_r2 ->> 'period_start'),
    'FAIL: generate_monthly_payout_report changed period on second call';
  -- Clean up test row.
  DELETE FROM public.monthly_payout_reports WHERE period_start = '2020-01-01';
  RAISE NOTICE 'PASS: generate_monthly_payout_report upserts idempotently';
END $$;

-- ── 8. Schema integrity checks ───────────────────────────────────────────────
DO $$
BEGIN
  -- withdrawal_risk_assessments must have override columns.
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'withdrawal_risk_assessments'
       AND column_name  = 'overridden_by'
  ), 'FAIL: withdrawal_risk_assessments.overridden_by column missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'withdrawal_risk_assessments'
       AND column_name  = 'overridden_at'
  ), 'FAIL: withdrawal_risk_assessments.overridden_at column missing';

  -- wallets must have reserved and withdrawn columns (from 073).
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'wallets'
       AND column_name  = 'reserved_earnings_sen'
  ), 'FAIL: wallets.reserved_earnings_sen column missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'wallets'
       AND column_name  = 'withdrawn_earnings_sen'
  ), 'FAIL: wallets.withdrawn_earnings_sen column missing';

  RAISE NOTICE 'PASS: All required schema columns present';
END $$;

SELECT 'All 074 SQL assertions completed. Review NOTICE lines above for PASS/FAIL.' AS result;

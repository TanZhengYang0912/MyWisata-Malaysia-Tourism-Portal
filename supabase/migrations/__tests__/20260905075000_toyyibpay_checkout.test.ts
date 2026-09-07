import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260905075000_toyyibpay_checkout.sql'),
  'utf8',
);

describe('ToyyibPay checkout migration', () => {
  it('adds a durable provider-create attempt state and service-only lifecycle RPCs', () => {
    expect(sql).toContain('provider_create_status');
    expect(sql).toContain('provider_create_attempted_at');
    expect(sql).toContain('provider_create_completed_at');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.begin_toyyibpay_checkout');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.complete_toyyibpay_checkout');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.begin_toyyibpay_checkout\(UUID\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.begin_toyyibpay_checkout\(UUID\) TO service_role/i);
  });

  it('allows only one unambiguous BillCode and rejects an indeterminate retry', () => {
    expect(sql).toContain("provider_create_status = 'creating'");
    expect(sql).toContain("provider_create_status = 'created'");
    expect(sql).toContain("'state', 'indeterminate'");
    expect(sql).toContain('provider_payment_id_mismatch');
    expect(sql).toMatch(/\^\[A-Za-z0-9\]\{8\}\$/);
  });

  it('extends provider settlement for ToyyibPay with status-qualified pending evidence', () => {
    expect(sql).toContain("p_provider NOT IN ('stripe', 'toyyibpay'");
    expect(sql).toContain("LOWER(COALESCE(p_outcome, '')) NOT IN ('succeeded', 'failed', 'cancelled', 'expired', 'pending')");
    expect(sql).toContain("p_provider = 'toyyibpay' AND v_session.payment_method = 'bank_transfer'");
    expect(sql).toContain("WHEN 'pending' THEN 'requires_action'");
    expect(sql).toContain("IF LOWER(p_outcome) = 'pending' THEN");
    expect(sql).toContain("SET status = 'requires_action'");
    expect(sql).toContain("p_provider <> 'toyyibpay'");
  });

  it('records pending without finalizing or releasing the checkout', () => {
    const pendingBranch = sql.slice(
      sql.indexOf("IF LOWER(p_outcome) = 'pending' THEN"),
      sql.indexOf("v_result := public.finalize_checkout"),
    );
    expect(pendingBranch).toContain('INSERT INTO public.payment_events');
    expect(pendingBranch).not.toContain('finalize_checkout(');
    expect(pendingBranch).not.toContain('release_wallet_split_checkout');
    expect(pendingBranch).not.toContain("status = 'failed'");
    expect(sql).toContain('ON CONFLICT (provider, provider_event_id) DO NOTHING');
  });

  it('keeps settlement service-only and indexes reconcilable pending bills', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.settle_provider_checkout\(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.settle_provider_checkout\(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT\) TO service_role/i);
    expect(sql).toContain('idx_payments_toyyibpay_reconciliation');
    expect(sql).toContain("WHERE provider = 'toyyibpay'");
  });
});

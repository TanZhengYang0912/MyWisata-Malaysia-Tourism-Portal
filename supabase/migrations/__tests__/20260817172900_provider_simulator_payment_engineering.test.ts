import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../20260817172900_provider_simulator_payment_engineering.sql', import.meta.url);

describe('provider simulator payment engineering migration', () => {
  it('blocks authenticated external-payment success at the database boundary', () => {
    expect(existsSync(migrationUrl)).toBe(true);
    if (!existsSync(migrationUrl)) return;
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.finalize_customer_wallet_checkout');
    expect(sql).toMatch(/v_session\.payment_method\s*<>\s*'wallet'[\s\S]+RAISE EXCEPTION 'provider_confirmation_required'/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.finalize_checkout\(UUID, TEXT, TEXT, TEXT\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.finalize_checkout\(UUID, TEXT, TEXT, TEXT\) TO service_role/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.finalize_customer_wallet_checkout\(UUID, TEXT\) TO authenticated/i);
  });

  it('adds service-only atomic provider settlement with payload-bound replay checks', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.settle_provider_checkout');
    expect(sql).toContain('p_amount_sen BIGINT');
    expect(sql).toContain('p_currency TEXT');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('provider_event_conflict');
    expect(sql).toContain('p_payload_sha256');
    expect(sql).toMatch(/INSERT INTO public\.payment_events[\s\S]+p_provider[\s\S]+p_provider_event_id/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.settle_provider_checkout\(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.settle_provider_checkout\(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT\) TO service_role/i);
  });

  it('enforces the exact checkout method and provider pairs', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain("p_provider = 'stripe'");
    expect(sql).toContain("v_session.payment_method IN ('stripe_card', 'wallet_split')");
    expect(sql).toContain("p_provider IN ('tng_ewallet_simulator', 'grabpay_simulator')");
    expect(sql).toContain("v_session.payment_method = 'ewallet'");
    expect(sql).toContain("p_provider = 'bank_transfer_simulator'");
    expect(sql).toContain("v_session.payment_method = 'bank_transfer'");
  });

  it('keeps wallet split valid and prevents customers releasing another wallet reservation', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toMatch(/orders_payment_method_check[\s\S]+wallet_split/i);
    expect(sql).toMatch(/payments_method_check[\s\S]+wallet_split/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.release_wallet_split_checkout\(UUID\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.release_wallet_split_checkout\(UUID\) TO service_role/i);
  });

  it('adds service-only amount-bound simulated refund attempts and settlement', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain('provider_refund_id');
    expect(sql).toContain('provider_refund_event_id');
    expect(sql).toContain('provider_failure_code');
    expect(sql).toContain('provider_failure_message');
    expect(sql).toContain('attempt_count');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.begin_simulated_refund');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.settle_simulated_refund');
    expect(sql).toContain('p_amount_sen BIGINT');
    expect(sql).toContain('p_currency TEXT');
    expect(sql).toContain('refund_provider_event_conflict');
    expect(sql).toMatch(/begin_simulated_refund[\s\S]+refund_already_active/i);
    expect(sql).toMatch(/settle_simulated_refund[\s\S]+v_payment\.status\s*<>\s*'succeeded'[\s\S]+refund_payment_not_succeeded/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.begin_simulated_refund\(UUID, TEXT, TEXT\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.begin_simulated_refund\(UUID, TEXT, TEXT\) TO service_role/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.settle_simulated_refund[\s\S]+FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.settle_simulated_refund[\s\S]+TO service_role/i);
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../20260821132100_finalize_full_wallet_split_checkout.sql', import.meta.url);

describe('full-wallet split finalization migration', () => {
  it('allows only a fully reserved zero-remainder split through the authenticated wallet finalizer', () => {
    expect(existsSync(migrationUrl)).toBe(true);
    if (!existsSync(migrationUrl)) return;
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.finalize_customer_wallet_checkout');
    expect(sql).toContain("v_session.payment_method = 'wallet_split'");
    expect(sql).toContain("LOWER(COALESCE(p_outcome, '')) <> 'succeeded'");
    expect(sql).toContain("IF v_user IS NULL THEN RAISE EXCEPTION 'checkout_auth_required'; END IF;");
    expect(sql).toContain("IF v_session.user_id <> v_user THEN RAISE EXCEPTION 'checkout_not_owned'; END IF;");
    expect(sql).toMatch(/checkout_wallet_reservations[\s\S]+FOR UPDATE/i);
    expect(sql).toContain("v_reservation.user_id <> v_session.user_id");
    expect(sql).toContain("v_reservation.status <> 'reserved'");
    expect(sql).toMatch(/payments[\s\S]+FOR UPDATE/i);
    expect(sql).toMatch(/v_reservation\.topup_amount_sen \+ v_reservation\.earnings_amount_sen <> v_total_sen/i);
    expect(sql).toMatch(/v_payment\.amount <> 0/i);
    expect(sql).toMatch(/RAISE EXCEPTION 'provider_confirmation_required'/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.finalize_customer_wallet_checkout\(UUID, TEXT\) TO authenticated/i);
  });
});

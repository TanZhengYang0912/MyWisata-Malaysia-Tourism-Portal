import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = [
  new URL('../../legacy-migrations/084_payout_destinations.sql', import.meta.url),
  new URL('../20260821132100_finalize_full_wallet_split_checkout.sql', import.meta.url),
  new URL('../20260830013000_independent_capability_hard_guards.sql', import.meta.url),
].map((path) => readFileSync(path, 'utf8')).join('\n');

describe('084 payout destination and wallet split migration', () => {
  it('stores provider references, verifies withdrawal eligibility, and supports wallet reservations', () => {
    expect(sql).toContain('verification_status');
    expect(sql).toContain('provider_reference');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.checkout_wallet_reservations');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reserve_wallet_split_checkout');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.release_wallet_split_checkout');
    expect(sql).toContain("v_user.kyc_status <> 'approved'");
    expect(sql).toContain("RAISE EXCEPTION 'payout_destination_required'");
  });
});

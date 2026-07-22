import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = new URL('../084_payout_destinations.sql', import.meta.url);

describe('084 payout destination and wallet split migration', () => {
  it('stores provider references, verifies withdrawal eligibility, and supports wallet reservations', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('verification_status');
    expect(sql).toContain('provider_reference');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.checkout_wallet_reservations');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reserve_wallet_split_checkout');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.release_wallet_split_checkout');
    expect(sql).toContain('phone_verified_at IS NOT NULL');
    expect(sql).toContain("RAISE EXCEPTION 'payout_destination_required'");
  });
});

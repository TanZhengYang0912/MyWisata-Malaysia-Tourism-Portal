import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = new URL('../083_vendor_recommendation_claim_onboarding.sql', import.meta.url);

describe('083 vendor recommendation claim migration', () => {
  it('defines a single-use, phone-verified atomic claim boundary', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.claim_vendor_recommendation(');
    expect(sql).toContain('phone_verified_at IS NOT NULL');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain("RAISE EXCEPTION 'invite_already_claimed'");
    expect(sql).toContain("RAISE EXCEPTION 'invite_expired'");
    expect(sql).toContain('UNIQUE (recommendation_id)');
  });
});

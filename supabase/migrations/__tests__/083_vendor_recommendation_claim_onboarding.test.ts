import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const canonicalClaimPath = new URL('../20260826024400_recommendation_vendor_claim_closure.sql', import.meta.url);
const conversionPath = new URL('../20260824221600_domain_role_matrix.sql', import.meta.url);
const prebaselineSchemaPath = new URL('../../legacy-migrations/083_vendor_recommendation_claim_onboarding.sql', import.meta.url);

const sql = [canonicalClaimPath, conversionPath, prebaselineSchemaPath]
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

describe('083 vendor recommendation claim migration', () => {
  it('defines a single-use, phone-verified atomic claim boundary', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.claim_vendor_recommendation(');
    expect(sql).toContain('phone_verified_at IS NOT NULL');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain("RAISE EXCEPTION 'invite_already_claimed'");
    expect(sql).toContain("RAISE EXCEPTION 'invite_expired'");
    expect(sql).toContain('UNIQUE (recommendation_id)');
  });

  it('defines conversion only after the claimed vendor is approved', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.convert_claimed_vendor_recommendation(');
    expect(sql).toContain("v_vendor.status <> 'approved'");
    expect(sql).toContain("RAISE EXCEPTION 'vendor_not_approved'");
    expect(sql).toContain("SET status = 'converted'");
  });
});

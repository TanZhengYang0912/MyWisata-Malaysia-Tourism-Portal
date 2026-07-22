import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = new URL('../082_phone_verification_checkout_guards.sql', import.meta.url);

describe('082 phone verification checkout guards migration', () => {
  it('protects order creation for direct authenticated RPC callers', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.enforce_phone_verified_order()');
    expect(sql).toContain("RAISE EXCEPTION 'phone_verification_required'");
    expect(sql).toContain('CREATE TRIGGER orders_require_phone_verification');
  });
});

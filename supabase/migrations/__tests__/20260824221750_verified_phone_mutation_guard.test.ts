import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260824221750_verified_phone_mutation_guard.sql',
);

function migrationSource() {
  expect(existsSync(migrationPath), 'verified phone guard migration must exist').toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

describe('verified phone mutation guard migration', () => {
  it('rejects direct phone changes unless a trusted RPC explicitly authorizes them', () => {
    const sql = migrationSource();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.protect_verification_fields()');
    expect(sql).toContain('IF NEW.phone IS DISTINCT FROM OLD.phone');
    expect(sql).toContain("current_setting('app.allow_verification_write', true) IS DISTINCT FROM 'on'");
    expect(sql).toContain("RAISE EXCEPTION 'phone_change_requires_otp'");
  });

  it('makes phone promotion service-only so OTP cannot be bypassed with a direct RPC', () => {
    const sql = migrationSource();

    expect(sql).toContain("IF auth.role() <> 'service_role' THEN");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.promote_to_phone_verified(UUID, TEXT) FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.promote_to_phone_verified(UUID, TEXT) TO service_role');
  });
});

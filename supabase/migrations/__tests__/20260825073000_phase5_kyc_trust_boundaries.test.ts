import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260825073000_phase5_kyc_trust_boundaries.sql',
);

function migrationSource() {
  expect(existsSync(migrationPath), 'Phase 5 KYC trust-boundary migration must exist').toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

describe('Phase 5 KYC trust boundaries', () => {
  it('lets only KYC reviewers promote another user while blocking direct verified-field mutation', () => {
    const sql = migrationSource();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.promote_to_kyc_verified(p_user_id UUID)');
    expect(sql).toContain('IF NOT public.can_review_kyc(auth.uid()) THEN');
    expect(sql).toContain('auth.uid() IS DISTINCT FROM OLD.id');
    expect(sql).not.toContain('OR public.is_admin(auth.uid())');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.promote_to_kyc_verified(UUID) FROM PUBLIC, anon, authenticated');
  });

  it('keeps KYC internal notes out of the customer-readable submission snapshot', () => {
    const sql = migrationSource();

    expect(sql).toContain('DROP CONSTRAINT IF EXISTS kyc_submissions_other_reason_detail_check');
    expect(sql).toContain('SET review_reason_detail = NULL');
    expect(sql).toContain('NEW.review_reason_detail := NULL');
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF review_reason_detail');
  });
});

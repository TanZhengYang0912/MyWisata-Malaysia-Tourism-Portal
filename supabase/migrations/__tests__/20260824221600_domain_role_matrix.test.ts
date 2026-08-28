import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260824221600_domain_role_matrix.sql',
);

function migrationSource() {
  expect(existsSync(migrationPath), 'domain role migration must exist').toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

describe('domain review role matrix migration', () => {
  it('defines KYC and recommendation capabilities for admin and super admin only', () => {
    const sql = migrationSource();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_review_kyc(uid UUID)');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_review_recommendation(uid UUID)');
    expect(sql).toMatch(/r\.name IN \('admin', 'super_admin'\)/);
    expect(sql).not.toMatch(/can_review_(?:kyc|recommendation)[\s\S]*?r\.name IN \([^)]*'approver'/);
  });

  it('removes anonymous capability discovery and keeps authenticated execution', () => {
    const sql = migrationSource();

    expect(sql).toContain('REVOKE ALL ON FUNCTION public.can_review_kyc(UUID) FROM PUBLIC, anon');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.can_review_recommendation(UUID) FROM PUBLIC, anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.can_review_kyc(UUID) TO authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.can_review_recommendation(UUID) TO authenticated');
  });

  it('uses domain capabilities in KYC and recommendation RPC and RLS boundaries', () => {
    const sql = migrationSource();

    expect(sql).toContain('IF NOT public.can_review_kyc(auth.uid()) THEN');
    expect(sql).toContain('IF NOT public.can_review_kyc(p_actor_id) THEN');
    expect(sql).toContain('IF NOT public.can_review_recommendation(auth.uid()) THEN');
    expect(sql).toContain('CREATE POLICY vendor_rec_read ON public.vendor_recommendations');
    expect(sql).toContain('OR public.can_review_recommendation(auth.uid())');
    expect(sql).toContain('CREATE POLICY recommendation_images_admin_read ON public.recommendation_images');
    expect(sql).toContain('USING (public.can_review_recommendation(auth.uid()))');
    expect(sql).toContain('DROP POLICY IF EXISTS kyc_select_own ON public.kyc_submissions');
    expect(sql).toContain('OR public.can_review_kyc(auth.uid())');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_link_vendor_recommendation(');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.convert_claimed_vendor_recommendation(');
    expect(sql).toContain('CREATE POLICY vendor_recommendation_claims_owner_read');
  });
});

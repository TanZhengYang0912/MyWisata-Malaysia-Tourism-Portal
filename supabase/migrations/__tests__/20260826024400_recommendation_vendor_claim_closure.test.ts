import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260826024400_recommendation_vendor_claim_closure.sql',
);

function migrationSource() {
  expect(existsSync(migrationPath), 'vendor claim closure migration must exist').toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

describe('recommendation vendor claim closure migration', () => {
  it('deploys the guided 11-parameter claim signature with least privilege', () => {
    const sql = migrationSource();

    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS public.claim_vendor_recommendation(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)',
    );
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.claim_vendor_recommendation(');
    expect(sql).toContain('p_category_id UUID');
    expect(sql).toContain('p_outlet_name TEXT');
    expect(sql).toContain('p_latitude DOUBLE PRECISION');
    expect(sql).toContain('p_longitude DOUBLE PRECISION');
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_vendor_recommendation\(\s*TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION\s*\) FROM PUBLIC, anon;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_vendor_recommendation\(\s*TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION\s*\) TO authenticated, service_role;/,
    );
  });

  it('preserves atomic guided onboarding and single-use invite protections', () => {
    const sql = migrationSource();

    expect(sql).toContain(
      "pg_advisory_xact_lock(hashtext('claim_vendor_recommendation'), hashtext(v_user_id::TEXT))",
    );
    expect(sql).toMatch(/vendor_recommendation_invites[\s\S]*?FOR UPDATE/);
    expect(sql).toMatch(/vendor_recommendations[\s\S]*?FOR UPDATE/);
    expect(sql).toContain("RAISE EXCEPTION 'phone_verification_required'");
    expect(sql).toContain("RAISE EXCEPTION 'email_mismatch'");
    expect(sql).toContain('INSERT INTO public.vendors');
    expect(sql).toContain('INSERT INTO public.vendor_onboarding_profiles');
    expect(sql).toContain('INSERT INTO public.outlets');
    expect(sql).toContain('INSERT INTO public.vendor_recommendation_claims');
    expect(sql).toContain("SET status = 'onboarding'");
    expect(sql).toMatch(/'inactive'\s*,\s*'pending_review'/);
  });

  it('atomically approves a vendor and converts a linked recommendation', () => {
    const sql = migrationSource();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_approve_claimed_vendor(');
    expect(sql).toContain('p_vendor_id UUID');
    expect(sql).toContain('public.is_admin(v_actor_id)');
    expect(sql).toContain('public.can_review_recommendation(v_actor_id)');
    expect(sql).toContain(
      'IF v_claim_recommendation_id IS NULL AND NOT public.is_admin(v_actor_id) THEN',
    );
    expect(sql).toContain("IF v_vendor.status NOT IN ('pending', 'rejected') THEN");
    expect(sql).toContain('UPDATE public.vendors');
    expect(sql).toContain('INSERT INTO public.vendor_onboarding_profiles');
    expect(sql).toContain('ON CONFLICT (vendor_id) DO UPDATE SET');
    expect(sql).toContain('INSERT INTO public.user_roles');
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql).toContain('IF v_claim_recommendation_id IS NOT NULL THEN');
    expect(sql).toContain('public.convert_claimed_vendor_recommendation(');
    expect(sql).toMatch(
      /UPDATE public\.vendors[\s\S]*?public\.convert_claimed_vendor_recommendation/,
    );
    expect(sql).toContain("'converted', v_claim_recommendation_id IS NOT NULL");
  });

  it('does not suppress conversion errors and exposes only authenticated execution', () => {
    const sql = migrationSource();
    const approvalFunction = sql.split(
      'CREATE OR REPLACE FUNCTION public.admin_approve_claimed_vendor(',
    )[1];

    expect(approvalFunction).toBeDefined();
    expect(approvalFunction).not.toMatch(/EXCEPTION[\s\S]*?WHEN OTHERS/);
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.admin_approve_claimed_vendor(UUID) FROM PUBLIC, anon',
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.admin_approve_claimed_vendor(UUID) TO authenticated, service_role',
    );
  });
});

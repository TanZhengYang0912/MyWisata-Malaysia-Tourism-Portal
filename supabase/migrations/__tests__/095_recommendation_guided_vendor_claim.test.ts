import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = new URL('../095_recommendation_guided_vendor_claim.sql', import.meta.url);

describe('095 recommendation guided vendor claim migration', () => {
  it('replaces the exact old overload with the guided claim signature and least privilege', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS public.claim_vendor_recommendation(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)',
    );
    expect(sql).toContain('p_category_id UUID');
    expect(sql).toContain('p_outlet_name TEXT');
    expect(sql).toContain('p_latitude DOUBLE PRECISION');
    expect(sql).toContain('p_longitude DOUBLE PRECISION');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.claim_vendor_recommendation(');
    expect(sql).toContain('FROM PUBLIC, anon');
    expect(sql).toContain('TO authenticated, service_role');
  });

  it('serializes each user and locks both single-use claim records before writing', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain(
      "pg_advisory_xact_lock(hashtext('claim_vendor_recommendation'), hashtext(v_user_id::TEXT))",
    );
    expect(sql).toMatch(/vendor_recommendation_invites[\s\S]*?FOR UPDATE/);
    expect(sql).toMatch(/vendor_recommendations[\s\S]*?FOR UPDATE/);
    expect(sql).toContain("status IN ('pending', 'approved')");
    expect(sql).toContain('vendor_recommendation_claims');
    expect(sql).toContain('claimed_by = v_user_id');
    expect(sql).toContain('recommendation_id = v_invite.recommendation_id');
  });

  it('validates identity, invitation lifecycle, and active category before creating rows', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("RAISE EXCEPTION 'not_authenticated'");
    expect(sql).toContain("RAISE EXCEPTION 'phone_verification_required'");
    expect(sql).toContain("RAISE EXCEPTION 'invite_not_found'");
    expect(sql).toContain("RAISE EXCEPTION 'invite_expired'");
    expect(sql).toContain("RAISE EXCEPTION 'invite_cancelled'");
    expect(sql).toContain("RAISE EXCEPTION 'invite_already_claimed'");
    expect(sql).toContain("RAISE EXCEPTION 'invite_email_mismatch'");
    expect(sql).toContain("RAISE EXCEPTION 'owner_already_has_vendor'");
    expect(sql).toContain("RAISE EXCEPTION 'recommendation_not_claimable'");
    expect(sql).toContain('c.id = p_category_id');
    expect(sql).toContain('c.is_active = TRUE');
    expect(sql).toContain("RAISE EXCEPTION 'category_not_active'");
  });

  it('atomically creates the pending vendor, submitted profile, and inactive first outlet', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('INSERT INTO public.vendors');
    expect(sql).toContain('description, business_type');
    expect(sql).toContain('v_category_slug');
    expect(sql).toContain('INSERT INTO public.vendor_onboarding_profiles');
    expect(sql).toContain("'submitted'");
    expect(sql).toContain('NULLIF(BTRIM(p_contact_phone), \'\')');
    expect(sql).not.toMatch(/v_user\.phone(?!_verified_at)/);
    expect(sql).toContain('INSERT INTO public.outlets');
    expect(sql).toContain('address, phone, email, lat, lng, status, review_status');
    expect(sql).toMatch(/'inactive'\s*,\s*'pending_review'/);
    expect(sql).toContain("'outlet_id', v_outlet_id");
    expect(sql).not.toContain('INSERT INTO public.user_roles');
    expect(sql).not.toContain('category_id, status, review_status');
    expect(sql).not.toContain('approval_status');
  });

  it('keeps generated vendor and outlet slugs within the real schema limit', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("trim(BOTH '-' FROM regexp_replace(lower(p_business_name)");
    expect(sql).toContain("trim(BOTH '-' FROM regexp_replace(lower(p_outlet_name)");
    expect(sql).toMatch(/v_vendor_base_slug := LEFT\([\s\S]*?,\s*100\s*\);/);
    expect(sql).toMatch(/v_outlet_base_slug := LEFT\([\s\S]*?,\s*100\s*\);/);
    expect(sql).toContain("LEFT(v_vendor_base_slug, 100 - char_length(v_slug_suffix::TEXT) - 1)");
    expect(sql).toContain("LEFT(v_outlet_base_slug, 100 - char_length(v_slug_suffix::TEXT) - 1)");
  });

  it('keeps recommendation onboarding compatible with the staged evidence migration', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('DROP CONSTRAINT IF EXISTS vendor_recommendations_status_check');
    expect(sql).toContain("'changes_requested'");
    expect(sql).toContain("'invited'");
    expect(sql).toContain("'onboarding'");
    expect(sql).toContain("SET status = 'onboarding'");
  });
});

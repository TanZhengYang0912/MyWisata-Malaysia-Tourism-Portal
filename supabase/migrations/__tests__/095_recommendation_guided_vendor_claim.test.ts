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
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_vendor_recommendation\(\s*TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION\s*\) FROM PUBLIC, anon;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_vendor_recommendation\(\s*TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION\s*\) TO authenticated, service_role;/,
    );
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

    const advisoryLock = sql.indexOf("pg_advisory_xact_lock(hashtext('claim_vendor_recommendation')");
    const userLock = sql.indexOf('FROM public.users u');
    const inviteLock = sql.indexOf('FROM public.vendor_recommendation_invites i');
    const ownerCheck = sql.indexOf("v.status IN ('pending', 'approved')");
    const recommendationLock = sql.indexOf('FROM public.vendor_recommendations r');
    expect(advisoryLock).toBeGreaterThan(-1);
    expect(userLock).toBeGreaterThan(advisoryLock);
    expect(inviteLock).toBeGreaterThan(userLock);
    expect(sql.indexOf('FOR UPDATE', userLock)).toBeLessThan(inviteLock);
    expect(ownerCheck).toBeGreaterThan(inviteLock);
    expect(recommendationLock).toBeGreaterThan(ownerCheck);
    expect(sql.indexOf('FOR UPDATE', inviteLock)).toBeLessThan(ownerCheck);
    expect(sql.indexOf('FOR UPDATE', recommendationLock)).toBeGreaterThan(recommendationLock);
  });

  it('validates identity, invitation lifecycle, and active category before creating rows', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("RAISE EXCEPTION 'not_authenticated'");
    expect(sql).toContain("RAISE EXCEPTION 'phone_verification_required'");
    expect(sql).toContain("RAISE EXCEPTION 'invite_not_found'");
    expect(sql).toContain("RAISE EXCEPTION 'invite_expired'");
    expect(sql).toContain("RAISE EXCEPTION 'invite_cancelled'");
    expect(sql).toContain("RAISE EXCEPTION 'invite_already_claimed'");
    expect(sql).toContain("RAISE EXCEPTION 'email_mismatch'");
    expect(sql).not.toContain("RAISE EXCEPTION 'invite_email_mismatch'");
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
    expect(sql).toContain('RETURNING id INTO v_claim_id');
    expect(sql).toContain("'claim_id', v_claim_id");
    expect(sql).toContain("'onboarding_profile_vendor_id', v_vendor_id");
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
    expect(sql.match(/EXCEPTION\s+WHEN unique_violation/g)).toHaveLength(2);
    expect(sql).toMatch(/INSERT INTO public\.vendors[\s\S]*?EXCEPTION\s+WHEN unique_violation[\s\S]*?v_slug_suffix := v_slug_suffix \+ 1/);
    expect(sql).toMatch(/INSERT INTO public\.outlets[\s\S]*?EXCEPTION\s+WHEN unique_violation[\s\S]*?v_slug_suffix := v_slug_suffix \+ 1/);
    expect(sql).toMatch(/IF EXISTS \(SELECT 1 FROM public\.vendors v WHERE v\.slug = v_vendor_slug\)/);
    expect(sql).toMatch(/IF EXISTS \(SELECT 1 FROM public\.outlets o WHERE o\.slug = v_outlet_slug\)/);
    const vendorRetry = sql.match(
      /INSERT INTO public\.vendors[\s\S]*?EXCEPTION\s+WHEN unique_violation[\s\S]*?END;\s*END LOOP;/,
    )?.[0];
    const outletRetry = sql.match(
      /INSERT INTO public\.outlets[\s\S]*?EXCEPTION\s+WHEN unique_violation[\s\S]*?END;\s*END LOOP;/,
    )?.[0];
    expect(vendorRetry).toMatch(/IF EXISTS[\s\S]*?THEN[\s\S]*?ELSE\s+RAISE;\s+END IF;/);
    expect(outletRetry).toMatch(/IF EXISTS[\s\S]*?THEN[\s\S]*?ELSE\s+RAISE;\s+END IF;/);
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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260830012000_independent_verification_facts.sql',
);

function functionBody(sql: string, signature: RegExp): string {
  const match = sql.match(signature);
  if (!match?.[1]) throw new Error(`Function body not found for ${signature}`);
  return match[1];
}

describe('independent verification facts migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('guards Profile completion as a server-managed verification fact', () => {
    const guard = functionBody(sql, /CREATE OR REPLACE FUNCTION public\.protect_verification_fields\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
    const promote = functionBody(sql, /CREATE OR REPLACE FUNCTION public\.promote_to_profile_complete\(p_user_id UUID\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);

    expect(guard).toContain('NEW.profile_completed_at IS DISTINCT FROM OLD.profile_completed_at');
    expect(guard).toContain("current_setting('app.allow_verification_write', true) = 'on'");
    expect(guard).not.toContain('OR public.is_admin(auth.uid())');
    expect(guard).not.toContain('public.can_review_kyc(auth.uid())');
    expect(promote).toMatch(/set_config\('app\.allow_verification_write', 'on', true\)[\s\S]*profile_completed_at = COALESCE\(profile_completed_at, now\(\)\)/);
  });

  it('completes Profile from the four profile sections without Phone or KYC', () => {
    const body = functionBody(sql, /CREATE OR REPLACE FUNCTION public\.promote_to_profile_complete\(p_user_id UUID\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);

    expect(body).toContain('profile_completed_at = COALESCE(profile_completed_at, now())');
    expect(body).toContain('full_name');
    expect(body).toContain('city');
    expect(body).toContain('country');
    expect(body).toContain('avatar_url');
    expect(body).toContain('bio');
    expect(body).toContain('preference_survey_responses');
    expect(body).toContain("'default-avatar.png'");
    expect(body).toContain("'default-avatar.jpg'");
    expect(body).toContain("'default-avatar.jpeg'");
    expect(body).toContain("'default-avatar.webp'");
    expect(body).toContain("'default-avatar.svg'");
    expect(body).toContain('cardinality(response.interests)');
    expect(body).not.toContain('phone_verified_at');
    expect(body).not.toContain('kyc_status');
    expect(body).not.toContain('tier_rank');
  });

  it('keeps the compatibility tier fail-closed for non-linear fact combinations', () => {
    const body = functionBody(sql, /CREATE OR REPLACE FUNCTION public\.recompute_compatibility_tier\(p_user_id UUID\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);

    expect(body).toMatch(/phone_verified_at IS NOT NULL[\s\S]*profile_completed_at IS NOT NULL[\s\S]*kyc_status = 'approved'[\s\S]*THEN 'kyc_verified'/);
    expect(body).toMatch(/phone_verified_at IS NOT NULL[\s\S]*profile_completed_at IS NOT NULL[\s\S]*THEN 'profile_complete'/);
    expect(body).toMatch(/phone_verified_at IS NOT NULL[\s\S]*THEN 'phone_verified'/);
  });

  it('recomputes compatibility metadata after every trusted Phone transition', () => {
    const promote = functionBody(sql, /CREATE OR REPLACE FUNCTION public\.promote_to_phone_verified\([\s\S]*?p_phone TEXT[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
    const clear = functionBody(sql, /CREATE OR REPLACE FUNCTION public\.clear_phone_verification\(p_user_id UUID\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);

    expect(promote).toContain("auth.role() <> 'service_role'");
    expect(promote).toContain("pg_advisory_xact_lock(hashtext('phone_verify:' || p_phone))");
    expect(promote).toContain('phone_already_claimed');
    expect(promote).toContain('email_verified_at');
    expect(promote).not.toContain('tier_rank');
    expect(promote).toMatch(/set_config\('app\.allow_verification_write', 'on', true\)[\s\S]*phone_verified_at = now\(\)[\s\S]*recompute_compatibility_tier\(p_user_id\)/);

    expect(clear).toContain('auth.uid() IS DISTINCT FROM p_user_id');
    expect(clear).toContain('public.is_admin(auth.uid())');
    expect(clear).toMatch(/set_config\('app\.allow_verification_write', 'on', true\)[\s\S]*phone_verified_at = NULL[\s\S]*recompute_compatibility_tier\(p_user_id\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.promote_to_phone_verified\(UUID, TEXT\)\s+FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.promote_to_phone_verified\(UUID, TEXT\)\s+TO service_role/);
  });

  it('begins an authenticated subject-bound KYC draft without Profile, Phone, or tier prerequisites', () => {
    const body = functionBody(sql, /CREATE OR REPLACE FUNCTION public\.begin_kyc_submission\([\s\S]*?p_ocr_consent BOOLEAN[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);

    expect(body).toContain("auth.role() <> 'service_role'");
    expect(body).toContain('ocr_consent_required');
    expect(body).toContain('invalid_ic_fingerprint');
    expect(body).toContain('invalid_document_type');
    expect(body).toContain("pg_advisory_xact_lock(hashtext('kyc_submit:' || p_user_id::text))");
    expect(body).toContain("status IN ('draft', 'pending')");
    expect(body).toContain('legal_name_snapshot');
    expect(body).toContain('identity_snapshot_captured_at');
    expect(body).not.toContain('tier_rank');
    expect(body).not.toContain('profile_completed_at');
    expect(body).not.toContain('phone_verified_at');
  });

  it('finalizes only the caller-owned draft with validated private storage evidence', () => {
    const body = functionBody(sql, /CREATE OR REPLACE FUNCTION public\.finalize_kyc_submission\([\s\S]*?p_back_path TEXT[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);

    expect(body).toContain('auth.uid() IS NULL');
    expect(body).toContain('user_id = auth.uid()');
    expect(body).toContain("status = 'draft'");
    expect(body).toContain("bucket_id = 'kyc-documents'");
    expect(body).toContain('v_front_token <> v_back_token');
    expect(body).toContain('documents_missing');
    expect(body).toContain('invalid_document_mime');
    expect(body).toContain('kyc_submission_documents');
    expect(body).not.toContain('tier_rank');
    expect(body).not.toContain('profile_completed_at');
    expect(body).not.toContain('phone_verified_at');
  });

  it('can abandon a caller-owned draft after OCR evidence was recorded', () => {
    const body = functionBody(sql, /CREATE OR REPLACE FUNCTION public\.abandon_kyc_submission\(p_submission_id UUID\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);

    expect(body).toContain('auth.uid() IS NULL');
    expect(body).toContain('user_id = auth.uid()');
    expect(body).toContain("status = 'draft'");
    expect(body).toMatch(/DELETE FROM public\.kyc_ocr_results[\s\S]*DELETE FROM public\.kyc_submissions/);
  });

  it('approves KYC independently while preserving reviewer and append-only evidence controls', () => {
    const promote = functionBody(sql, /CREATE OR REPLACE FUNCTION public\.promote_to_kyc_verified\(p_user_id UUID\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
    const review = functionBody(sql, /CREATE OR REPLACE FUNCTION public\.admin_review_kyc\([\s\S]*?p_reason_detail TEXT DEFAULT NULL[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);

    expect(promote).toContain('can_review_kyc(auth.uid())');
    expect(promote).toContain('auth.uid() = p_user_id');
    expect(promote).toContain("kyc_status = 'approved'");
    expect(promote).not.toContain('phone_verified_at');
    expect(promote).not.toContain('profile_completed_at');
    expect(promote).not.toContain('tier_rank');

    expect(review).toContain("p_action NOT IN ('approve', 'reject', 'request_info')");
    expect(review).toContain('can_review_kyc(auth.uid())');
    expect(review).toContain('auth.uid() = p_user_id');
    expect(review).toContain("status = 'pending'");
    expect(review).toContain('assigned_to IS DISTINCT FROM auth.uid()');
    expect(review).toContain('INSERT INTO public.kyc_review_events');
    expect(review).toContain('INSERT INTO public.audit_logs');
    expect(review).toContain('INSERT INTO public.notifications');
    expect(review).not.toContain('tier_rank');
    expect(review).not.toContain('profile_completed_at');
    expect(review).not.toContain('phone_verified_at');
  });

  it('does not create duplicate approval evidence or widen browser grants', () => {
    expect(sql).not.toContain('kyc_approved_at');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.begin_kyc_submission\(UUID, TEXT, TEXT, TEXT, BOOLEAN\)\s+FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.begin_kyc_submission\(UUID, TEXT, TEXT, TEXT, BOOLEAN\)\s+TO service_role/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.promote_to_kyc_verified\(UUID\)\s+FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_review_kyc\(UUID, UUID, TEXT, TEXT, TEXT\)\s+TO authenticated/);
  });
});

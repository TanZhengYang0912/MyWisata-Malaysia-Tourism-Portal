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

  it('completes Profile from the four profile sections without Phone or KYC', () => {
    const body = functionBody(sql, /CREATE OR REPLACE FUNCTION public\.promote_to_profile_complete\(p_user_id UUID\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);

    expect(body).toContain('profile_completed_at = COALESCE(profile_completed_at, now())');
    expect(body).toContain('full_name');
    expect(body).toContain('city');
    expect(body).toContain('country');
    expect(body).toContain('avatar_url');
    expect(body).toContain('bio');
    expect(body).toContain('preference_survey_responses');
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

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260824221900_kyc_review_events.sql');

function migrationSource() {
  expect(existsSync(migrationPath), 'KYC review events migration must exist').toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

describe('KYC immutable review evidence migration', () => {
  it('captures legal identity on the mutable submission snapshot', () => {
    const sql = migrationSource();

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS legal_name_snapshot TEXT');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS email_snapshot TEXT');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS phone_snapshot TEXT');
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.begin_kyc_submission\([\s\S]*p_ocr_consent BOOLEAN[\s\S]*legal_name_snapshot[\s\S]*v_user\.full_name/);
    expect(sql).toContain("IF NOT COALESCE(p_ocr_consent, FALSE) THEN RAISE EXCEPTION 'ocr_consent_required'; END IF;");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.begin_kyc_submission(UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.begin_kyc_submission(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO service_role');
  });

  it('creates append-only review events with actor role and customer message evidence', () => {
    const sql = migrationSource();

    expect(sql).toContain('CREATE TABLE public.kyc_review_events');
    expect(sql).toContain('from_status TEXT NOT NULL');
    expect(sql).toContain('to_status TEXT NOT NULL');
    expect(sql).toContain('actor_role TEXT NOT NULL');
    expect(sql).toContain('customer_message TEXT');
    expect(sql).toContain("RAISE EXCEPTION 'kyc_review_events_append_only'");
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.kyc_review_events');
  });

  it('uses compare-and-set assignment and enforces assignee-only decisions with a super-admin override', () => {
    const sql = migrationSource();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.claim_kyc_submission(');
    expect(sql).toMatch(/UPDATE public\.kyc_submissions[\s\S]*assigned_to = auth\.uid\(\)[\s\S]*assigned_to IS NULL/);
    expect(sql).toContain("RAISE EXCEPTION 'kyc_not_assigned'");
    expect(sql).toContain('public.is_super_admin(auth.uid())');
    expect(sql).toContain('INSERT INTO public.kyc_review_events');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261109062020_chinese_passport_single_page_evidence.sql', 'utf8');

describe('Chinese passport single-page KYC migration', () => {
  it('keeps passport drafts single-page and requires both MyKad/driver pages', () => {
    expect(migration).toMatch(/p_document_type='passport' AND p_back_storage_path IS NOT NULL/);
    expect(migration).toMatch(/p_document_type<>'passport' AND \(p_back_storage_path IS NULL/);
    expect(migration).toMatch(/p_document_type='passport' AND p_back_evidence_sha256 IS NOT NULL/);
    expect(migration).toMatch(/p_document_type<>'passport' AND \(p_back_evidence_sha256 IS NULL/);
  });

  it('finalizes only one front page for passports while retaining storage MIME and token checks', () => {
    expect(migration).toMatch(/v_case\.document_type='passport' AND p_back_path IS NOT NULL/);
    expect(migration).toMatch(/v_case\.document_type<>'passport' AND p_back_path IS NULL/);
    expect(migration).toContain("INSERT INTO public.kyc_submission_documents(submission_id,side,storage_path,mime_type)");
    expect(migration).toContain("IF p_back_path IS NOT NULL THEN INSERT INTO public.kyc_submission_documents");
    expect(migration).toContain("'kyc-documents'");
  });

  it('keeps passport evidence revisions and reviewer access limited to the current required sides', () => {
    expect(migration).toMatch(/s\.document_type='passport' AND count\(\*\)=1 AND bool_and\(d\.side='front'\)/);
    expect(migration).toMatch(/s\.document_type<>'passport' AND count\(\*\)=2 AND count\(DISTINCT d\.side\)=2/);
    expect(migration).toMatch(/v_required_count:=CASE WHEN v_case\.document_type='passport' THEN 1 ELSE 2 END/);
    expect(migration).toMatch(/v_case\.document_type<>'passport' OR a\.after_data->>'side'='front'/);
  });

  it('stores only bounded passport comparison facts for staff review', () => {
    for (const field of ['issuer_country', 'nationality', 'mrz_status', 'visual_comparison_status']) expect(migration).toContain(field);
    expect(migration).toContain("FROM PUBLIC,anon,authenticated");
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.record_kyc_ocr_result_v2');
  });

  it('blocks passport approval without unexpired, MRZ-valid, visibly consistent Chinese ordinary-passport evidence', () => {
    expect(migration).toContain('CREATE TRIGGER guard_passport_kyc_approval');
    expect(migration).toMatch(/issuer_country IS DISTINCT FROM 'CN'[\s\S]*nationality IS DISTINCT FROM 'CN'/);
    expect(migration).toMatch(/mrz_status IS DISTINCT FROM 'valid'[\s\S]*visual_comparison_status IS DISTINCT FROM 'consistent'/);
    expect(migration).toMatch(/expiry_date IS NULL OR v_ocr\.expiry_date<=current_date/);
  });
});

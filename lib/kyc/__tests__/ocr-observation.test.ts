import { describe, expect, it } from 'vitest';
import { buildKycOcrSourceRevision, canReuseKycOcrObservation } from '../ocr-observation';

const input = {
  documentType: 'passport' as const,
  cleanTransformVersion: 'clean-v1',
  frontInputSha256: 'a'.repeat(64),
  frontCleanSha256: 'b'.repeat(64),
  backInputSha256: null,
  backCleanSha256: null,
};

describe('KYC OCR observation source binding', () => {
  it('builds a deterministic passport source revision with no back side', () => {
    expect(buildKycOcrSourceRevision(input)).toMatch(/^[a-f0-9]{64}$/);
    expect(buildKycOcrSourceRevision(input)).toBe(buildKycOcrSourceRevision({ ...input }));
    expect(() => buildKycOcrSourceRevision({ ...input, backCleanSha256: 'c'.repeat(64) })).toThrow('invalid_kyc_ocr_source');
  });

  it('reuses an observation only when owner, draft, source, artifact and parser policy all match', () => {
    const expected = { ownerId: 'owner', draftId: 'draft', sourceRevision: 'source', artifactRevision: 'artifact', engine: 'tesseract', parserVersion: 'p1', policyVersion: 'k1' };
    expect(canReuseKycOcrObservation(expected, expected)).toBe(true);
    expect(canReuseKycOcrObservation(expected, { ...expected, artifactRevision: 'changed' })).toBe(false);
    expect(canReuseKycOcrObservation(expected, { ...expected, ownerId: 'other' })).toBe(false);
    expect(canReuseKycOcrObservation(expected, { ...expected, parserVersion: 'p2' })).toBe(false);
  });
});

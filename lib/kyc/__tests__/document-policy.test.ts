import { describe, expect, it } from 'vitest';
import { getRequiredKycDocumentSides, hasRequiredKycEvidence, isSupportedDocumentNumber } from '../document-policy';

describe('KYC document policy', () => {
  it('requires only the passport biodata page and keeps MyKad two-sided', () => {
    expect(getRequiredKycDocumentSides('passport')).toEqual(['front']);
    expect(getRequiredKycDocumentSides('national_id')).toEqual(['front', 'back']);
    expect(getRequiredKycDocumentSides('driving_license')).toEqual(['front', 'back']);
  });

  it('accepts the existing MyKad number shape and Chinese ordinary passport series', () => {
    expect(isSupportedDocumentNumber('national_id', '900101-14-5678')).toBe(true);
    expect(isSupportedDocumentNumber('passport', 'G12345678')).toBe(true);
    expect(isSupportedDocumentNumber('passport', 'E12345678')).toBe(true);
    expect(isSupportedDocumentNumber('passport', 'F12345678')).toBe(false);
    expect(isSupportedDocumentNumber('passport', 'EA1234567')).toBe(true);
    expect(isSupportedDocumentNumber('passport', 'EI1234567')).toBe(false);
    expect(isSupportedDocumentNumber('passport', 'EO1234567')).toBe(false);
  });

  it('requires both MyKad images while allowing a passport biodata page alone', () => {
    const image = { mimeType: 'image/jpeg', bytes: new Uint8Array([1]) };
    expect(hasRequiredKycEvidence('national_id', image, null)).toBe(false);
    expect(hasRequiredKycEvidence('national_id', image, image)).toBe(true);
    expect(hasRequiredKycEvidence('passport', image, null)).toBe(true);
  });
});

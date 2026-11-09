import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { verifyManualPassportFields } from '../ocr';

const fields = {
  mrzLine1: 'P<CHNLI<<WEI<MING'.padEnd(44, '<'),
  mrzLine2: 'EA12345676CHN9001011M3001019<<<<<<<<<<<<<<04',
  holderName: 'LI, WEI MING', documentNumber: 'EA1234567', issuerCountry: 'CN', nationality: 'CN',
  birthDate: '1990-01-01', expiryDate: '2030-01-01', sex: 'M' as const,
};

describe('verifyManualPassportFields', () => {
  it('recomputes MRZ and every visible comparison and returns only safe approval facts', () => {
    expect(verifyManualPassportFields(fields, '2026-11-09')).toEqual({
      valid: true, method: 'manual_td3_v1', nationality: 'CN', expiryDate: '2030-01-01',
      mrzStatus: 'valid', visualComparisonStatus: 'consistent',
    });
  });

  it.each(['holderName', 'documentNumber', 'issuerCountry', 'nationality', 'birthDate', 'expiryDate', 'sex'] as const)(
    'rejects a conflicting visible %s', (field) => {
      expect(verifyManualPassportFields({ ...fields, [field]: 'different' }, '2026-11-09').valid).toBe(false);
    },
  );

  it('rejects invalid check digits and an expired or same-day expiry', () => {
    expect(verifyManualPassportFields({ ...fields, mrzLine2: fields.mrzLine2.slice(0, -1) + '5' }, '2026-11-09').valid).toBe(false);
    expect(verifyManualPassportFields(fields, '2030-01-01').valid).toBe(false);
    expect(verifyManualPassportFields(fields, '2031-01-01').valid).toBe(false);
    expect(verifyManualPassportFields({ ...fields, expiryDate: '2030-02-31' }, '2026-11-09').valid).toBe(false);
    expect(verifyManualPassportFields({ ...fields, birthDate: '1990-02-31' }, '2026-11-09').valid).toBe(false);
  });

  it('rejects a visible expiry whose year matches MRZ but month or day differs', () => {
    expect(verifyManualPassportFields({ ...fields, expiryDate: '2030-02-01' }, '2026-11-09').valid).toBe(false);
    expect(verifyManualPassportFields({ ...fields, expiryDate: '2030-01-02' }, '2026-11-09').valid).toBe(false);
  });

  it('fails closed on incomplete transcriptions without returning MRZ or DOB', () => {
    const result = verifyManualPassportFields({ ...fields, mrzLine1: '' }, '2026-11-09');
    expect(result).toEqual({ valid: false });
    expect(JSON.stringify(result)).not.toContain('900101');
  });
});

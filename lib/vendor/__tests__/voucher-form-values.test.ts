import { describe, expect, it } from 'vitest';
import { localDateTimeToIso, optionalNumber, optionalSelect } from '@/lib/vendor/voucher-form-values';

describe('voucher form value normalization', () => {
  it('converts a datetime-local value to an ISO timestamp', () => {
    const localValue = '2026-07-31T19:33';

    expect(localDateTimeToIso(localValue)).toBe(new Date(localValue).toISOString());
  });

  it('returns undefined for empty or invalid optional values', () => {
    expect(localDateTimeToIso('')).toBeUndefined();
    expect(localDateTimeToIso('not-a-date')).toBeUndefined();
    expect(optionalNumber('')).toBeUndefined();
    expect(optionalNumber('100')).toBe(100);
    expect(optionalSelect('')).toBeUndefined();
    expect(optionalSelect('outlet-id')).toBe('outlet-id');
  });
});

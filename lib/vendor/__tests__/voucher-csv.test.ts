import { describe, expect, it } from 'vitest';
import { allocateVoucherCodes, makeVoucherCode, parseVoucherCsv } from '@/lib/vendor/voucher-csv';

describe('voucher CSV helpers', () => {
  it('preserves commas and escaped quotes inside quoted CSV cells', () => {
    expect(parseVoucherCsv('code,name\r\nTRAVEL001,"Summer, ""Special"""\r\n')).toEqual([
      ['code', 'name'],
      ['TRAVEL001', 'Summer, "Special"'],
    ]);
  });

  it('generates stable uppercase sequential voucher codes', () => {
    expect(makeVoucherCode('travel', 1)).toBe('TRAVEL001');
    expect(makeVoucherCode('TRAVEL', 12)).toBe('TRAVEL012');
  });

  it('skips codes already used by the database or the same upload', () => {
    expect(allocateVoucherCodes('TRAVEL', 3, new Set(['TRAVEL001', 'TRAVEL003']))).toEqual(['TRAVEL002', 'TRAVEL004', 'TRAVEL005']);
  });
});

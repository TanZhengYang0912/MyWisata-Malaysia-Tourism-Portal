import { describe, expect, it } from 'vitest';
import { buildVoucherCsv, previewVoucherCodes, validateVoucherCsvDrafts, type VoucherCsvDraft } from '@/lib/vendor/voucher-csv-builder';

const baseRow: VoucherCsvDraft = {
  code: '', name: 'Malaysia Welcome', voucherType: 'percent', discountValue: '15', minSpend: '30',
  maxUses: '100', perCustomerLimit: '1', validFrom: '2026-08-01T00:00', validUntil: '2026-08-31T23:59',
  outletId: '', productId: '', buyQuantity: '', freeQuantity: '',
};

describe('voucher CSV builder', () => {
  it('creates a CSV with the API headers and normalized dates', () => {
    const csv = buildVoucherCsv([{ ...baseRow, name: 'Welcome, Malaysia' }]);
    expect(csv).toContain('code,name,voucherType,discountValue');
    expect(csv).toContain('"Welcome, Malaysia"');
    expect(csv).toContain('2026-07-31T16:00:00.000Z');
  });

  it('validates BOGO product and quantity requirements before upload', () => {
    const errors = validateVoucherCsvDrafts([{ ...baseRow, voucherType: 'bogo', discountValue: '0' }]);
    expect(errors[0]).toEqual([
      'Choose an eligible product for BOGO.',
      'Enter a buy quantity.',
      'Enter a free quantity.',
    ]);
  });

  it('previews generated codes without changing explicit codes', () => {
    expect(previewVoucherCodes([
      { ...baseRow, code: '' },
      { ...baseRow, code: 'WELCOME50' },
      { ...baseRow, code: '' },
    ], 'TRAVEL')).toEqual({ generated: 2, sampleCodes: ['TRAVEL001', 'WELCOME50', 'TRAVEL002'] });
  });
});

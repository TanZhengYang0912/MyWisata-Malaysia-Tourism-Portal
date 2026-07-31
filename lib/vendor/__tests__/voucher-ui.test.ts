import { describe, expect, it } from 'vitest';
import { voucherConfirmationCopy, voucherDiscountLabel } from '@/lib/vendor/voucher-ui';

describe('voucher UI helpers', () => {
  it('formats discount labels for every voucher type', () => {
    expect(voucherDiscountLabel({ voucherType: 'fixed', discountValue: 10 })).toBe('RM10.00 off');
    expect(voucherDiscountLabel({ voucherType: 'percent', discountValue: 15 })).toBe('15% off');
    expect(voucherDiscountLabel({ voucherType: 'bogo', discountValue: 0, buyQuantity: 1, freeQuantity: 1 })).toBe('Buy 1 Get 1');
    expect(voucherDiscountLabel({ voucherType: 'bogo', discountValue: 0, buyQuantity: 2, freeQuantity: 3 })).toBe('Buy 2 Get 3');
    expect(voucherDiscountLabel({ voucherType: 'unknown', discountValue: 0 })).toBe('Voucher offer');
  });

  it('describes single and bulk confirmation actions', () => {
    expect(voucherConfirmationCopy({ action: 'activate', code: 'TRAVEL001' })).toEqual({
      title: 'Activate TRAVEL001?',
      description: 'Customers can use this voucher after it is active and approved.',
      confirmLabel: 'Activate voucher',
      tone: 'primary',
    });
    expect(voucherConfirmationCopy({ action: 'deactivate', code: 'TRAVEL001' }).tone).toBe('danger');
    expect(voucherConfirmationCopy({ action: 'upload', count: 12 }).description).toContain('12');
    expect(voucherConfirmationCopy({ action: 'create' }).confirmLabel).toBe('Submit for review');
  });
});

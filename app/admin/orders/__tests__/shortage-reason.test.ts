import { describe, expect, it } from 'vitest';
import { createEventShortageReason } from '../shortage-reason';

function createReason(reasonCode: string, manualReason = '') {
  return createEventShortageReason(reasonCode, manualReason, (key) => `translated:${key}`);
}

describe('event shortage reason values', () => {
  it.each([
    ['supplier_unavailable', 'supplierUnavailable'],
    ['inventory_mismatch', 'inventoryMismatch'],
    ['item_damaged_or_lost', 'itemDamagedOrLost'],
    ['restock_delayed', 'restockDelayed'],
  ])('uses the translated label for preset reason %s', (reasonCode, translationKey) => {
    expect(createReason(reasonCode)).toBe(`translated:eventOperations.shortageReasonOptions.${translationKey}`);
  });

  it('trims manual Other text and accepts the existing 5–500 character range', () => {
    expect(createReason('other', '  Stock was damaged  ')).toBe('Stock was damaged');
    expect(createReason('other', `x${'a'.repeat(499)}`)).toHaveLength(500);
  });

  it('requires 5–500 non-whitespace characters for Other', () => {
    expect(createReason('other', '    ')).toBeNull();
    expect(createReason('other', '  four  ')).toBeNull();
    expect(createReason('other', 'x'.repeat(501))).toBeNull();
  });

  it('rejects an empty or unknown selection', () => {
    expect(createReason('')).toBeNull();
    expect(createReason('not-a-shortage-reason')).toBeNull();
  });
});

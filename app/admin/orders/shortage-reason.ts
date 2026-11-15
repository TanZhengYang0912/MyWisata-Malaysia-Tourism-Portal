export const EVENT_SHORTAGE_REASON_OPTIONS = [
  { value: 'supplier_unavailable', key: 'eventOperations.shortageReasonOptions.supplierUnavailable' },
  { value: 'inventory_mismatch', key: 'eventOperations.shortageReasonOptions.inventoryMismatch' },
  { value: 'item_damaged_or_lost', key: 'eventOperations.shortageReasonOptions.itemDamagedOrLost' },
  { value: 'restock_delayed', key: 'eventOperations.shortageReasonOptions.restockDelayed' },
] as const;

export function createEventShortageReason(
  reasonCode: string,
  manualReason: string,
  translate: (key: string) => string,
): string | null {
  if (reasonCode === 'other') {
    const reason = manualReason.trim();
    return reason.length >= 5 && reason.length <= 500 ? reason : null;
  }
  const option = EVENT_SHORTAGE_REASON_OPTIONS.find((candidate) => candidate.value === reasonCode);
  return option ? translate(option.key) : null;
}

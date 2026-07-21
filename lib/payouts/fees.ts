export function payoutFeeSen(payout: unknown): number {
  const fee = typeof payout === 'object' && payout !== null && 'fee' in payout
    ? (payout as { fee?: unknown }).fee
    : undefined;
  return typeof fee === 'number' && Number.isSafeInteger(fee) && fee >= 0 ? fee : 0;
}

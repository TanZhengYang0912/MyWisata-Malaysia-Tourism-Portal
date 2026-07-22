import type { WalletAllocation } from './types';

const MYR_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export function toSen(amountRm: string | number): number | null {
  const value = typeof amountRm === 'number' ? String(amountRm) : amountRm.trim();
  if (!MYR_AMOUNT.test(value)) return null;

  const [whole, decimal = ''] = value.split('.');
  const amountSen = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(amountSen) && amountSen > 0 ? amountSen : null;
}

export function fromSen(amountSen: number): number {
  if (!Number.isSafeInteger(amountSen)) throw new TypeError('amountSen must be a safe integer');
  return amountSen / 100;
}

export function allocateWalletSpend(
  topupSen: number,
  earningsSen: number,
  totalSen: number,
): WalletAllocation | null {
  if (![topupSen, earningsSen, totalSen].every(Number.isSafeInteger)) return null;
  if (topupSen < 0 || earningsSen < 0 || totalSen <= 0 || topupSen + earningsSen < totalSen) return null;

  const topupSpend = Math.min(topupSen, totalSen);
  return { topupSen: topupSpend, earningsSen: totalSen - topupSpend };
}

// ── Money Helper ────────────────────────────────────────────
// ALL monetary values in this app are in RM (Malaysian Ringgit).
// Only this file does arithmetic on money. Call toRM() before display.
// Never use JS floating point directly: use add/subtract/multiply.

const CURRENCY = 'MYR';
const LOCALE   = 'en-MY';

/** Round to 2 decimal places (banker's rounding via toFixed) */
export function roundRM(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function add(...amounts: number[]): number {
  return roundRM(amounts.reduce((acc, n) => acc + n, 0));
}

export function subtract(a: number, b: number): number {
  return roundRM(a - b);
}

export function multiply(amount: number, factor: number): number {
  return roundRM(amount * factor);
}

/** Apply a percentage discount (0–100) */
export function applyPercent(amount: number, pct: number): number {
  return roundRM(amount * (pct / 100));
}

/** Format RM amount for display: "RM 55.00" */
export function toRM(amount: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Parse "RM 55.00" or "55.00" back to number */
export function parseRM(str: string): number {
  const n = parseFloat(str.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : roundRM(n);
}

/** Compute variant price: product.base_price + variant.price_offset */
export function variantPrice(basePrice: number, priceOffset: number): number {
  return roundRM(basePrice + priceOffset);
}

/** Compute line total for a cart/order item */
export function lineTotal(unitPrice: number, quantity: number): number {
  return multiply(unitPrice, quantity);
}

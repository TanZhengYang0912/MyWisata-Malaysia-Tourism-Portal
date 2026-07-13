// ── Money Helper ────────────────────────────────────────────
// ALL monetary values in this app are in RM (Malaysian Ringgit).
// This is the ONLY file that does arithmetic on money.
//
// Precision strategy: convert to integer sen (1 RM = 100 sen), operate, convert back.
// This eliminates IEEE 754 half-value bugs like Math.round(0.145 * 100) → 14 (not 15).
//
// Public API contract:
//   - Inputs: number (RM, up to 2 decimals) — anything else throws or is truncated
//   - Outputs: number (RM, guaranteed ≤2 decimals) OR string (formatted)
//   - Never returns NaN, Infinity, or a negative number from a positive input

const CURRENCY = 'MYR';
const LOCALE   = 'en-MY';
const MAX_RM   = 1_000_000_000;   // sanity ceiling to catch bad inputs

// ── Internal: sen (integer cents) representation ────────────

function toSen(rm: number): number {
  if (!Number.isFinite(rm)) throw new MoneyError('Non-finite money value', rm);
  if (Math.abs(rm) > MAX_RM) throw new MoneyError('Amount exceeds sanity ceiling', rm);
  // Add epsilon before scaling. Adding it after multiplying by 100 is too
  // small to move values such as 1.005 off the IEEE-754 midpoint.
  return Math.round((rm + Number.EPSILON * Math.sign(rm)) * 100);
}

function fromSen(sen: number): number {
  return Math.round(sen) / 100;
}

export class MoneyError extends Error {
  constructor(msg: string, public value: unknown) { super(`[money] ${msg}: ${value}`); }
}

// ── Public API ──────────────────────────────────────────────

/** Round an RM value to 2 decimal places using half-away-from-zero. */
export function roundRM(amount: number): number {
  return fromSen(toSen(amount));
}

/** Sum any number of RM amounts safely. */
export function add(...amounts: number[]): number {
  const totalSen = amounts.reduce((acc, n) => acc + toSen(n), 0);
  return fromSen(totalSen);
}

/** subtract(a, b) = a − b, rounded. Result may be negative. */
export function subtract(a: number, b: number): number {
  return fromSen(toSen(a) - toSen(b));
}

/** multiply(amount, factor) — factor is a plain multiplier (e.g., quantity or tax rate). */
export function multiply(amount: number, factor: number): number {
  if (!Number.isFinite(factor)) throw new MoneyError('Non-finite factor', factor);
  return fromSen(Math.round(toSen(amount) * factor));
}

/** Apply a percentage (0..100). applyPercent(200, 15) = 30.00 */
export function applyPercent(amount: number, pct: number): number {
  if (pct < 0 || pct > 100) throw new MoneyError('Percentage out of range 0..100', pct);
  return multiply(amount, pct / 100);
}

/** Format for user display: "RM 55.00" */
export function toRM(amount: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundRM(amount));
}

/** Parse "RM 55.00" or "55.00" back to a number. Non-numeric → 0. */
export function parseRM(str: string): number {
  const cleaned = str.replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return roundRM(n);
}

/** Compute variant price: product.base_price + variant.price_offset. */
export function variantPrice(basePrice: number, priceOffset: number): number {
  return add(basePrice, priceOffset);
}

/** Compute line total: unit_price × quantity. */
export function lineTotal(unitPrice: number, quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError('Quantity must be a non-negative integer', quantity);
  }
  return multiply(unitPrice, quantity);
}

/**
 * Convert RM to integer sen using banker's (half-even) rounding.
 * At exactly 0.5 sen, rounds to the nearest even integer — unbiased
 * over many transactions. Use for all commission calculations.
 *
 *   roundSen(0.005) → 0   (0 is even)
 *   roundSen(0.015) → 2   (2 is even)
 */
export function roundSen(rm: number): number {
  if (!Number.isFinite(rm)) throw new MoneyError('Non-finite money value', rm);
  if (Math.abs(rm) > MAX_RM)  throw new MoneyError('Amount exceeds sanity ceiling', rm);
  const scaled   = rm * 100;
  const floor    = Math.floor(scaled);
  const fraction = scaled - floor;
  if (fraction > 0.5) return floor + 1;
  if (fraction < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;  // half-even tie-break
}

/** Guard: is this a valid non-negative RM amount? */
export function isValidRM(amount: unknown): amount is number {
  return typeof amount === 'number'
      && Number.isFinite(amount)
      && amount >= 0
      && amount <= MAX_RM
      && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.001;
}

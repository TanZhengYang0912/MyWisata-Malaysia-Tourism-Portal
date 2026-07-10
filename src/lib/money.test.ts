import { describe, it, expect } from 'vitest';
import {
  roundRM, add, subtract, multiply, applyPercent,
  toRM, parseRM, variantPrice, lineTotal, isValidRM, MoneyError,
} from './money';

describe('roundRM', () => {
  it('rounds to 2 decimals', () => {
    expect(roundRM(1.234)).toBe(1.23);
    expect(roundRM(1.235)).toBe(1.24);    // half-away-from-zero
    expect(roundRM(1.005)).toBe(1.01);    // classic IEEE trap — MUST round up
    expect(roundRM(0.145)).toBe(0.15);    // second IEEE trap
  });

  it('handles zero and integers cleanly', () => {
    expect(roundRM(0)).toBe(0);
    expect(roundRM(100)).toBe(100);
    expect(roundRM(-5.5)).toBe(-5.5);
  });

  it('throws on non-finite input', () => {
    expect(() => roundRM(NaN)).toThrow(MoneyError);
    expect(() => roundRM(Infinity)).toThrow(MoneyError);
  });

  it('throws when amount exceeds sanity ceiling', () => {
    expect(() => roundRM(1e10)).toThrow(MoneyError);
  });
});

describe('add', () => {
  it('sums without floating point drift', () => {
    expect(add(0.1, 0.2)).toBe(0.30);            // the canonical IEEE 754 test
    expect(add(0.1, 0.2, 0.3)).toBe(0.60);
    expect(add(1.11, 2.22, 3.33)).toBe(6.66);
  });

  it('handles empty and single values', () => {
    expect(add()).toBe(0);
    expect(add(5)).toBe(5);
  });

  it('preserves ledger-scale precision', () => {
    // A wallet with 100 entries of 0.03 should be exactly 3.00
    const entries = Array(100).fill(0.03);
    expect(add(...entries)).toBe(3.00);
  });
});

describe('subtract', () => {
  it('subtracts precisely', () => {
    expect(subtract(0.3, 0.1)).toBe(0.20);
    expect(subtract(100, 33.33)).toBe(66.67);
  });

  it('allows negative result', () => {
    expect(subtract(10, 15)).toBe(-5);
  });
});

describe('multiply', () => {
  it('multiplies with rounding', () => {
    expect(multiply(19.99, 3)).toBe(59.97);
    expect(multiply(10, 0.15)).toBe(1.50);
  });

  it('handles fractional multipliers (tax, commission)', () => {
    expect(multiply(200, 0.03)).toBe(6);        // 3% commission
    expect(multiply(123.45, 0.10)).toBe(12.35); // 10% off
  });

  it('rejects non-finite factor', () => {
    expect(() => multiply(10, NaN)).toThrow(MoneyError);
  });
});

describe('applyPercent', () => {
  it('computes discount amount', () => {
    expect(applyPercent(200, 15)).toBe(30);
    expect(applyPercent(99.99, 10)).toBe(10.00); // 9.999 → 10.00
    expect(applyPercent(50, 0)).toBe(0);
  });

  it('rejects out-of-range percentages', () => {
    expect(() => applyPercent(100, -1)).toThrow(MoneyError);
    expect(() => applyPercent(100, 101)).toThrow(MoneyError);
  });
});

describe('lineTotal', () => {
  it('computes unit × quantity', () => {
    expect(lineTotal(15.50, 3)).toBe(46.50);
    expect(lineTotal(0.99, 100)).toBe(99);
  });

  it('rejects non-integer quantity', () => {
    expect(() => lineTotal(10, 1.5)).toThrow(MoneyError);
    expect(() => lineTotal(10, -1)).toThrow(MoneyError);
  });

  it('accepts zero quantity', () => {
    expect(lineTotal(10, 0)).toBe(0);
  });
});

describe('variantPrice', () => {
  it('adds base + offset', () => {
    expect(variantPrice(55.00, -20.00)).toBe(35.00);   // child pricing
    expect(variantPrice(85.00, 0)).toBe(85.00);
    expect(variantPrice(85.00, 15.50)).toBe(100.50);
  });
});

describe('toRM formatting', () => {
  it('formats with MYR symbol and 2 decimals', () => {
    const formatted = toRM(1234.5);
    expect(formatted).toMatch(/RM|MYR/);
    expect(formatted).toMatch(/1,234\.50/);
  });

  it('formats zero as RM 0.00', () => {
    expect(toRM(0)).toMatch(/0\.00/);
  });

  it('rounds display input', () => {
    expect(toRM(1.005)).toMatch(/1\.01/);
  });
});

describe('parseRM', () => {
  it('parses formatted currency strings', () => {
    expect(parseRM('RM 55.00')).toBe(55);
    expect(parseRM('MYR 1,234.56')).toBe(1234.56);
    expect(parseRM('12.5')).toBe(12.5);
  });

  it('returns 0 for non-numeric input', () => {
    expect(parseRM('abc')).toBe(0);
    expect(parseRM('')).toBe(0);
  });
});

describe('isValidRM', () => {
  it('accepts valid non-negative amounts with ≤2 decimals', () => {
    expect(isValidRM(0)).toBe(true);
    expect(isValidRM(12.34)).toBe(true);
    expect(isValidRM(999_999)).toBe(true);
  });

  it('rejects too many decimals, negatives, non-numbers', () => {
    expect(isValidRM(12.345)).toBe(false);
    expect(isValidRM(-5)).toBe(false);
    expect(isValidRM(NaN)).toBe(false);
    expect(isValidRM('10' as unknown)).toBe(false);
    expect(isValidRM(null)).toBe(false);
  });
});

describe('ledger scenario — full withdrawal + refund cycle', () => {
  it('maintains exact balance across many operations', () => {
    // Start: RM 100
    // Add: 3 rewards of RM 12.50, RM 8.33, RM 4.17 = RM 25.00
    // Withdraw: RM 30.00
    // Refund: RM 5.55
    let balance = 100;
    balance = add(balance, 12.50, 8.33, 4.17);
    expect(balance).toBe(125.00);

    balance = subtract(balance, 30);
    expect(balance).toBe(95.00);

    balance = add(balance, 5.55);
    expect(balance).toBe(100.55);
  });
});

import { describe, expect, it } from 'vitest';
import { allocateWalletSpend, toSen } from '../amounts';

describe('allocateWalletSpend', () => {
  it('uses top-up balance before earnings', () => {
    expect(allocateWalletSpend(1_000, 2_000, 1_500)).toEqual({
      topupSen: 1_000,
      earningsSen: 500,
    });
  });

  it('refuses an insufficient combined balance', () => {
    expect(allocateWalletSpend(300, 400, 701)).toBeNull();
  });
});

describe('toSen', () => {
  it('accepts positive two-decimal MYR amounts', () => {
    expect(toSen('50.01')).toBe(5_001);
  });

  it.each(['0', '-1', '50.001', '1e2', 'not-money'])('rejects invalid MYR amount %s', (amount) => {
    expect(toSen(amount)).toBeNull();
  });
});

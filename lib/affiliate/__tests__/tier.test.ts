import { describe, expect, it } from 'vitest';
import { resolveTier, type CommissionTier, type TierSignals } from '../tier';

const STANDARD: CommissionTier = { id: 't1', tierName: 'standard', rate: 0.03, minReferrals: 0, minSalesAmountSen: 0, activePeriodDays: null, maxFraudRatePercent: null };
const ACTIVE: CommissionTier = { id: 't2', tierName: 'active', rate: 0.04, minReferrals: 4, minSalesAmountSen: 50000, activePeriodDays: 90, maxFraudRatePercent: 20 };
const TOP: CommissionTier = { id: 't3', tierName: 'top', rate: 0.05, minReferrals: 8, minSalesAmountSen: 200000, activePeriodDays: 60, maxFraudRatePercent: 10 };
const TIERS = [STANDARD, ACTIVE, TOP];

function signals(overrides: Partial<TierSignals>): TierSignals {
  return { referralCount: 0, salesAmountSen: 0, daysSinceLastConfirmed: null, fraudRatePercent: 0, ...overrides };
}

describe('resolveTier', () => {
  it('stays on standard with no activity at all', () => {
    const info = resolveTier(TIERS, signals({}));
    expect(info.tierName).toBe('standard');
  });

  it('reaches active once conversion count, sales amount, and recency all qualify', () => {
    const info = resolveTier(TIERS, signals({ referralCount: 5, salesAmountSen: 60000, daysSinceLastConfirmed: 10 }));
    expect(info.tierName).toBe('active');
  });

  it('is blocked from active when sales amount is too low, despite enough referrals', () => {
    const info = resolveTier(TIERS, signals({ referralCount: 5, salesAmountSen: 10000, daysSinceLastConfirmed: 10 }));
    expect(info.tierName).toBe('standard');
  });

  it('downgrades from top back to active when the affiliate goes quiet past the active-period window', () => {
    // Meets top's referral/sales bar, but hasn't converted in 200 days — exceeds top's 60-day window AND active's 90-day window.
    const stale = resolveTier(TIERS, signals({ referralCount: 10, salesAmountSen: 250000, daysSinceLastConfirmed: 200 }));
    expect(stale.tierName).toBe('standard');

    // Same lifetime numbers, but active within active's 90-day window (not top's 60-day one) — lands on active, not top.
    const recentEnoughForActive = resolveTier(TIERS, signals({ referralCount: 10, salesAmountSen: 250000, daysSinceLastConfirmed: 75 }));
    expect(recentEnoughForActive.tierName).toBe('active');
  });

  it('caps at active when fraud rate exceeds top\'s max, even with top-tier volume', () => {
    const info = resolveTier(TIERS, signals({ referralCount: 10, salesAmountSen: 250000, daysSinceLastConfirmed: 5, fraudRatePercent: 15 }));
    expect(info.tierName).toBe('active');
  });

  it('reaches top when every signal qualifies', () => {
    const info = resolveTier(TIERS, signals({ referralCount: 10, salesAmountSen: 250000, daysSinceLastConfirmed: 5, fraudRatePercent: 2 }));
    expect(info.tierName).toBe('top');
  });

  it('drops all the way to standard when fraud rate is high enough to fail every gated tier', () => {
    const info = resolveTier(TIERS, signals({ referralCount: 10, salesAmountSen: 250000, daysSinceLastConfirmed: 5, fraudRatePercent: 99 }));
    expect(info.tierName).toBe('standard');
  });
});

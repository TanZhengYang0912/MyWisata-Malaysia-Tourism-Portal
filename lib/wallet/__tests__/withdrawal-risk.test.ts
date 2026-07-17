import { describe, expect, it } from 'vitest';
import { computeRiskLevel, type WithdrawalRiskSnapshot } from '../withdrawal-risk';

const base: WithdrawalRiskSnapshot = {
  kycStatus: 'approved',
  payoutsEnabled: true,
  amountSen: 10_000,
  dualApprovalThresholdSen: 50_000,
  recentFailedCount: 0,
  activeRequestCount: 1,
  accountAgeDays: 90,
};

describe('computeRiskLevel', () => {
  it('returns low for a clean profile below threshold', () => {
    expect(computeRiskLevel(base)).toBe('low');
  });

  it('returns high when KYC is not approved', () => {
    expect(computeRiskLevel({ ...base, kycStatus: 'pending' })).toBe('high');
    expect(computeRiskLevel({ ...base, kycStatus: null })).toBe('high');
    expect(computeRiskLevel({ ...base, kycStatus: 'rejected' })).toBe('high');
  });

  it('returns high when Stripe payouts are disabled', () => {
    expect(computeRiskLevel({ ...base, payoutsEnabled: false })).toBe('high');
  });

  it('returns high when there are 3 or more recent failures', () => {
    expect(computeRiskLevel({ ...base, recentFailedCount: 3 })).toBe('high');
    expect(computeRiskLevel({ ...base, recentFailedCount: 5 })).toBe('high');
  });

  it('returns high when activeRequestCount exceeds 1', () => {
    expect(computeRiskLevel({ ...base, activeRequestCount: 2 })).toBe('high');
  });

  it('returns review when amount equals the dual-approval threshold', () => {
    expect(computeRiskLevel({ ...base, amountSen: 50_000 })).toBe('review');
  });

  it('returns review when amount exceeds the dual-approval threshold', () => {
    expect(computeRiskLevel({ ...base, amountSen: 100_000 })).toBe('review');
  });

  it('returns review for 1 recent failure (not yet high)', () => {
    expect(computeRiskLevel({ ...base, recentFailedCount: 1 })).toBe('review');
    expect(computeRiskLevel({ ...base, recentFailedCount: 2 })).toBe('review');
  });

  it('returns review for accounts younger than 30 days', () => {
    expect(computeRiskLevel({ ...base, accountAgeDays: 29 })).toBe('review');
    expect(computeRiskLevel({ ...base, accountAgeDays: 0 })).toBe('review');
  });

  it('high beats review when multiple risk factors are present', () => {
    expect(computeRiskLevel({ ...base, kycStatus: 'pending', amountSen: 50_000 })).toBe('high');
  });

  it('just below threshold with clean profile is low', () => {
    expect(computeRiskLevel({ ...base, amountSen: 49_999 })).toBe('low');
  });
});

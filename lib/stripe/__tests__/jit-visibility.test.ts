import { describe, expect, it } from 'vitest';

import { shouldExposeStripePayoutSetup } from '../jit-visibility';

describe('shouldExposeStripePayoutSetup', () => {
  it('keeps Stripe hidden for ordinary tourists with no available earnings', () => {
    expect(shouldExposeStripePayoutSetup({
      availableEarningsRm: 0,
      withdrawRequested: false,
      returningFromOnboarding: false,
    })).toBe(false);
  });

  it('keeps Stripe hidden when a zero-earnings customer clicks Withdraw', () => {
    expect(shouldExposeStripePayoutSetup({
      availableEarningsRm: 0,
      withdrawRequested: true,
      returningFromOnboarding: false,
    })).toBe(false);
  });

  it('reveals optional setup automatically at RM50 available earnings', () => {
    expect(shouldExposeStripePayoutSetup({
      availableEarningsRm: 50,
      withdrawRequested: false,
      returningFromOnboarding: false,
    })).toBe(true);
  });

  it('reveals setup after Withdraw when the customer has positive earnings', () => {
    expect(shouldExposeStripePayoutSetup({
      availableEarningsRm: 10,
      withdrawRequested: true,
      returningFromOnboarding: false,
    })).toBe(true);
  });

  it('reloads payout status after returning from Stripe', () => {
    expect(shouldExposeStripePayoutSetup({
      availableEarningsRm: 0,
      withdrawRequested: false,
      returningFromOnboarding: true,
    })).toBe(true);
  });
});

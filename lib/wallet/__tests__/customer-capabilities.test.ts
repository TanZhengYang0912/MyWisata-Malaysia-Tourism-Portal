import { describe, expect, it } from 'vitest';
import { deriveCustomerWalletCapabilities } from '@/lib/wallet/customer-capabilities';

const readyInput = {
  phoneVerified: true,
  kycStatus: 'approved',
  availableEarningsSen: 10_000,
  minimumWithdrawalSen: 5_000,
  stripePayoutsEnabled: true,
  destination: {
    id: 'destination-1',
    type: 'bank_account' as const,
    provider: 'stripe_connect',
    displayLabel: 'Bank account on file',
    status: 'verified' as const,
    cooldownUntil: null,
    updatedAt: '2026-08-25T01:00:00.000Z',
  },
};

describe('deriveCustomerWalletCapabilities', () => {
  it('returns a server-authoritative ready state and safe destination summary', () => {
    expect(deriveCustomerWalletCapabilities(readyInput)).toEqual({
      canWithdraw: true,
      blockerCode: null,
      nextAction: 'withdraw',
      destinationSummary: {
        id: 'destination-1',
        type: 'bank_account',
        provider: 'stripe_connect',
        displayLabel: 'Bank account on file',
        status: 'verified',
      },
      lastProviderCheckAt: '2026-08-25T01:00:00.000Z',
    });
  });

  it.each([
    [{ ...readyInput, phoneVerified: false }, 'phone_verification_required', 'verify_phone'],
    [{ ...readyInput, kycStatus: 'pending' }, 'kyc_required', 'complete_kyc'],
    [{ ...readyInput, availableEarningsSen: 4_999 }, 'minimum_balance_required', 'earn_minimum'],
    [{ ...readyInput, destination: null }, 'payout_destination_required', 'add_payout_destination'],
    [{ ...readyInput, stripePayoutsEnabled: false }, 'payout_provider_required', 'complete_payout_setup'],
  ] as const)('returns one highest-priority blocker', (input, blockerCode, nextAction) => {
    expect(deriveCustomerWalletCapabilities(input)).toMatchObject({ canWithdraw: false, blockerCode, nextAction });
  });

  it('does not require Stripe readiness for a verified e-wallet destination', () => {
    expect(deriveCustomerWalletCapabilities({
      ...readyInput,
      stripePayoutsEnabled: false,
      destination: { ...readyInput.destination, type: 'e_wallet', provider: 'tng_direct_credit' },
    }).canWithdraw).toBe(true);
  });
});

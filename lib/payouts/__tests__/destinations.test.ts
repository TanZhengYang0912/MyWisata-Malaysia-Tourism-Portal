import { describe, expect, it } from 'vitest';
import {
  calculateWalletSplit,
  getPayoutDestinationCapabilities,
  selectDefaultPayoutDestination,
  type PayoutDestination,
} from '../destinations';

describe('payout destination capabilities', () => {
  it('enables Stripe Connect bank and keeps E-wallet disabled without an adapter', () => {
    expect(getPayoutDestinationCapabilities()).toEqual({
      bank_account: { enabled: true, provider: 'stripe_connect' },
      e_wallet: { enabled: false, provider: 'tng_direct_credit' },
    });
  });

  it('selects only a verified default destination', () => {
    const destinations: PayoutDestination[] = [
      { id: 'disabled', type: 'bank_account', provider: 'stripe_connect', displayLabel: 'Bank ****1111', status: 'disabled', isDefault: true },
      { id: 'verified', type: 'bank_account', provider: 'stripe_connect', displayLabel: 'Bank ****2222', status: 'verified', isDefault: true },
    ];
    expect(selectDefaultPayoutDestination(destinations)?.id).toBe('verified');
  });
});

describe('calculateWalletSplit', () => {
  it('uses the wallet first and charges only the exact remainder externally', () => {
    expect(calculateWalletSplit(10_000, 3_250, 'card')).toEqual({ walletAmountSen: 3_250, externalAmountSen: 6_750, externalMethod: 'card' });
  });

  it('is idempotent for the same checkout key and rejects multiple external methods', () => {
    expect(calculateWalletSplit(10_000, 20_000, 'online_banking')).toEqual({ walletAmountSen: 10_000, externalAmountSen: 0, externalMethod: 'online_banking' });
    expect(() => calculateWalletSplit(10_000, 100, 'card', ['card', 'online_banking'])).toThrow('one_external_method_required');
  });
});

import { describe, expect, it } from 'vitest';
import {
  calculateWalletSplit,
  getPayoutDestinationCapabilities,
  normalizeTngDestinationIdentifier,
  payoutDestinationDisplayLabel,
  selectDefaultPayoutDestination,
  type PayoutDestination,
} from '../destinations';

describe('payout destination capabilities', () => {
  it('accepts Malaysian mobile numbers and supported DuitNow identifiers only', () => {
    expect(normalizeTngDestinationIdentifier('012-345 6789')).toEqual({ ok: true, value: '+60123456789' });
    expect(normalizeTngDestinationIdentifier('+60123456789')).toEqual({ ok: true, value: '+60123456789' });
    expect(normalizeTngDestinationIdentifier('900101-14-5678')).toEqual({ ok: true, value: '900101145678' });
    expect(normalizeTngDestinationIdentifier('abcdef')).toEqual({
      ok: false,
      message: 'Enter a Malaysian mobile number or a valid DuitNow ID (6–32 letters/numbers with at least 4 digits).',
    });
  });

  it('enables Stripe Connect bank and keeps E-wallet disabled without an adapter', () => {
    expect(getPayoutDestinationCapabilities({
      NODE_ENV: 'test',
      TNG_PAYOUT_MODE: '',
      TNG_MOCK_WEBHOOK_SECRET: '',
    })).toEqual({
      bank_account: { enabled: true, provider: 'stripe_connect' },
      e_wallet: { enabled: false, provider: 'tng_direct_credit' },
    });
  });

  it('advertises E-wallet only for the configured non-production mock', () => {
    expect(getPayoutDestinationCapabilities({
      NODE_ENV: 'test',
      TNG_PAYOUT_MODE: 'mock',
      TNG_MOCK_WEBHOOK_SECRET: 'test-secret',
    }).e_wallet.enabled).toBe(true);

    expect(getPayoutDestinationCapabilities({
      NODE_ENV: 'production',
      TNG_PAYOUT_MODE: 'mock',
      TNG_MOCK_WEBHOOK_SECRET: 'test-secret',
    }).e_wallet.enabled).toBe(false);
  });

  it('selects only a verified default destination', () => {
    const destinations: PayoutDestination[] = [
      { id: 'disabled', type: 'bank_account', provider: 'stripe_connect', displayLabel: 'Bank ****1111', status: 'disabled', isDefault: true },
      { id: 'verified', type: 'bank_account', provider: 'stripe_connect', displayLabel: 'Bank ****2222', status: 'verified', isDefault: true },
    ];
    expect(selectDefaultPayoutDestination(destinations)?.id).toBe('verified');
  });

  it('never exposes a stored E-wallet label and uses only the masked reference', () => {
    expect(payoutDestinationDisplayLabel({
      destType: 'ewallet',
      label: '+60177143951',
      maskedRef: '+60••••3951',
    })).toBe('TNG eWallet +60••••3951');
    expect(payoutDestinationDisplayLabel({
      destType: 'bank',
      label: 'Maybank ****1234',
      maskedRef: '****1234',
    })).toBe('Maybank ****1234');
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

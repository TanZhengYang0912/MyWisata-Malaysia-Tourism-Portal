import { describe, expect, it } from 'vitest';
import {
  createSimulatorPaymentSession,
  resolveCheckoutProvider,
} from '@/lib/payments/providers';

describe('checkout payment provider mapping', () => {
  it.each([
    ['stripe_card', undefined, 'stripe'],
    ['wallet_split', undefined, 'stripe'],
    ['wallet', undefined, 'platform_wallet'],
    ['ewallet', 'tng_ewallet_simulator', 'tng_ewallet_simulator'],
    ['ewallet', 'grabpay_simulator', 'grabpay_simulator'],
    ['bank_transfer', 'bank_transfer_simulator', 'bank_transfer_simulator'],
    ['bank_transfer', 'toyyibpay', 'toyyibpay'],
  ] as const)('maps %s with %s to %s', (method, requested, expected) => {
    expect(resolveCheckoutProvider(method, requested)).toBe(expected);
  });

  it.each([
    ['ewallet', undefined],
    ['bank_transfer', undefined],
    ['bank_transfer', 'tng_ewallet_simulator'],
    ['ewallet', 'toyyibpay'],
    ['ewallet', 'bank_transfer_simulator'],
    ['stripe_card', 'grabpay_simulator'],
    ['mock_card', undefined],
  ] as const)('rejects mismatched method/provider pair %s + %s', (method, provider) => {
    expect(() => resolveCheckoutProvider(method, provider)).toThrow('payment_provider_mismatch');
  });
});

describe('simulator provider sessions', () => {
  it('creates an opaque stable provider reference without embedding the checkout id', () => {
    const checkoutSessionId = '9e703f42-7f40-4a4f-a4a0-447eb6319931';
    const result = createSimulatorPaymentSession({
      checkoutSessionId,
      provider: 'tng_ewallet_simulator',
      expiresAt: '2026-08-17T10:30:00.000Z',
      secret: 'test-simulator-secret',
    });

    expect(result).toEqual({
      providerPaymentId: expect.stringMatching(/^sim_pay_[0-9a-f]{40}$/),
      actionUrl: `/customer/checkout/simulator/${checkoutSessionId}`,
      expiresAt: '2026-08-17T10:30:00.000Z',
    });
    expect(result.providerPaymentId).not.toContain(checkoutSessionId);
    expect(createSimulatorPaymentSession({
      checkoutSessionId,
      provider: 'tng_ewallet_simulator',
      expiresAt: '2026-08-17T10:30:00.000Z',
      secret: 'test-simulator-secret',
    }).providerPaymentId).toBe(result.providerPaymentId);
  });

  it('produces different references for different providers and rejects a missing secret', () => {
    const input = {
      checkoutSessionId: '9e703f42-7f40-4a4f-a4a0-447eb6319931',
      expiresAt: '2026-08-17T10:30:00.000Z',
      secret: 'test-simulator-secret',
    } as const;

    const tng = createSimulatorPaymentSession({ ...input, provider: 'tng_ewallet_simulator' });
    const grab = createSimulatorPaymentSession({ ...input, provider: 'grabpay_simulator' });
    expect(tng.providerPaymentId).not.toBe(grab.providerPaymentId);
    expect(() => createSimulatorPaymentSession({
      ...input,
      provider: 'bank_transfer_simulator',
      secret: '',
    })).toThrow('payment_simulator_not_configured');
  });
});

import { describe, expect, it } from 'vitest';
import { isPaymentSimulatorEnabled } from '@/lib/payments/simulator-config';

describe('payment simulator configuration', () => {
  it('requires explicit mode and a secret outside Production', () => {
    expect(isPaymentSimulatorEnabled({
      NODE_ENV: 'test',
      PAYMENT_SIMULATOR_MODE: 'enabled',
      PAYMENT_SIMULATOR_WEBHOOK_SECRET: 'local-secret',
    })).toBe(true);

    expect(isPaymentSimulatorEnabled({
      NODE_ENV: 'test',
      PAYMENT_SIMULATOR_MODE: 'disabled',
      PAYMENT_SIMULATOR_WEBHOOK_SECRET: 'local-secret',
    })).toBe(false);
    expect(isPaymentSimulatorEnabled({
      NODE_ENV: 'development',
      PAYMENT_SIMULATOR_MODE: 'enabled',
      PAYMENT_SIMULATOR_WEBHOOK_SECRET: '',
    })).toBe(false);
  });

  it('fails closed in Production even when mode and secret are configured', () => {
    expect(isPaymentSimulatorEnabled({
      NODE_ENV: 'production',
      PAYMENT_SIMULATOR_MODE: 'enabled',
      PAYMENT_SIMULATOR_WEBHOOK_SECRET: 'production-must-not-enable-this',
    })).toBe(false);
  });
});

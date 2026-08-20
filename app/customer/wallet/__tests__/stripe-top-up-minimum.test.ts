import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync('app/customer/wallet/page.tsx', 'utf8');

describe('wallet Stripe top-up minimum contract', () => {
  it('uses the shared Stripe minimum for input and submit validation', () => {
    expect(pageSource).toContain('min={STRIPE_TOP_UP_MINIMUM_RM}');
    expect(pageSource).toContain('amount < STRIPE_TOP_UP_MINIMUM_RM');
  });

  it('interpolates the shared minimum into every locale message', () => {
    for (const locale of ['en', 'zh-CN', 'ms']) {
      const resources = JSON.parse(readFileSync(`app/i18n/locales/${locale}/customer.json`, 'utf8')) as {
        ui: { wallet: { minimumTopUp: string } };
      };
      expect(resources.ui.wallet.minimumTopUp).toContain('{{amount}}');
    }
  });
});

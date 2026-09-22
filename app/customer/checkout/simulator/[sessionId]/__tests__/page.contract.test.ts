import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const checkoutSource = readFileSync(
  new URL('../../../page.tsx', import.meta.url),
  'utf8',
);
const simulatorUrl = new URL('../page.tsx', import.meta.url);

describe('customer payment simulator experience', () => {
  it('separates simulator providers and removes client-declared external success', () => {
    expect(checkoutSource).toContain('labelKey: "strictMigration.checkout.methods.tng"');
    expect(checkoutSource).toContain('labelKey: "strictMigration.checkout.methods.grabpay"');
    expect(checkoutSource).toContain('labelKey: "strictMigration.checkout.methods.bankTransfer"');
    expect(checkoutSource).toContain('paymentProvider');
    expect(checkoutSource).toContain('simulatorUrl');
    expect(checkoutSource).not.toContain('Pay (Success)');
    expect(checkoutSource).not.toContain('Simulate failure');
  });

  it('renders explicit non-production copy and provider outcome controls', () => {
    expect(existsSync(simulatorUrl)).toBe(true);
    if (!existsSync(simulatorUrl)) return;
    const source = readFileSync(simulatorUrl, 'utf8');

    expect(source).toContain('tCustomer("strictMigration.paymentSimulator.eyebrow")');
    expect(source).toContain('tCustomer("strictMigration.paymentSimulator.notice")');
    expect(source).toContain('tCustomer("strictMigration.paymentSimulator.markFundsReceived")');
    expect(source).toContain('tCustomer("strictMigration.paymentSimulator.simulateSuccess")');
    expect(source).toContain('tCustomer("strictMigration.paymentSimulator.simulateFailure")');
    expect(source).toContain('tCustomer("strictMigration.paymentSimulator.cancelPayment")');
    expect(source).toContain('/api/payments/simulator/sessions/');
  });

  it('translates the requires-action simulator status in every customer locale', () => {
    const expected: Record<string, string> = {
      en: 'Action required',
      ms: 'Tindakan diperlukan',
      'zh-CN': '需要操作',
    };

    for (const [locale, translation] of Object.entries(expected)) {
      const customer = JSON.parse(readFileSync(resolve(process.cwd(), 'app/i18n/locales', locale, 'customer.json'), 'utf8'));
      expect(customer.strictMigration.paymentSimulator.statuses.requires_action).toBe(translation);
    }
  });
});

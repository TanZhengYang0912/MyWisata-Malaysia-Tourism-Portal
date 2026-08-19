import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const checkoutSource = readFileSync(
  new URL('../../../page.tsx', import.meta.url),
  'utf8',
);
const simulatorUrl = new URL('../page.tsx', import.meta.url);

describe('customer payment simulator experience', () => {
  it('separates simulator providers and removes client-declared external success', () => {
    expect(checkoutSource).toContain('Touch ’n Go eWallet — Simulator');
    expect(checkoutSource).toContain('GrabPay — Simulator');
    expect(checkoutSource).toContain('Bank transfer — Simulator');
    expect(checkoutSource).toContain('paymentProvider');
    expect(checkoutSource).toContain('simulatorUrl');
    expect(checkoutSource).not.toContain('Pay (Success)');
    expect(checkoutSource).not.toContain('Simulate failure');
  });

  it('renders explicit non-production copy and provider outcome controls', () => {
    expect(existsSync(simulatorUrl)).toBe(true);
    if (!existsSync(simulatorUrl)) return;
    const source = readFileSync(simulatorUrl, 'utf8');

    expect(source).toContain('Sandbox / Simulated');
    expect(source).toContain('No real money moves');
    expect(source).toContain('Mark funds received');
    expect(source).toContain('Simulate payment success');
    expect(source).toContain('Simulate failure');
    expect(source).toContain('Cancel payment');
    expect(source).toContain('/api/payments/simulator/sessions/');
  });
});

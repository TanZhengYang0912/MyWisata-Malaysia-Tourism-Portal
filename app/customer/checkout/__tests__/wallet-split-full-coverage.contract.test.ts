import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync('app/customer/checkout/page.tsx', 'utf8');

describe('wallet split with full wallet coverage', () => {
  it('uses the authenticated wallet finalizer when the server returns no external remainder', () => {
    expect(pageSource).toContain('externalAmountSen?: number');
    expect(pageSource).toContain('selectedMethod.paymentMethod === "wallet_split" && prepared.data.externalAmountSen === 0');
    expect(pageSource).toContain('const walletFinalization =');
  });
});

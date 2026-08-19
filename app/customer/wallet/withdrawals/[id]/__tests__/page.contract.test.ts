import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

describe('withdrawal receipt provider presentation', () => {
  it('does not claim every payout is settled by Stripe or a bank', () => {
    expect(source).toContain('payoutProvider');
    expect(source).toContain('ui.receipt.settlementNote');
    expect(source).not.toContain('Bank settlement timing depends on Stripe');
  });

  it('renders customer-safe status guidance and announces loading failures', () => {
    expect(source).toContain('statusGuidance');
    expect(source).toContain('role="alert"');
    expect(source).toContain('ui.actions.backToWallet');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('wallet payout destination display contract', () => {
  it('uses server capabilities and does not promise unavailable TNG payouts', () => {
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

    expect(page).toContain('payoutCapabilities');
    expect(page).toContain('capabilities');
    expect(page).toContain('payoutCapabilities.e_wallet.enabled && (');
    expect(page).toContain('tCustomer("ui.wallet.bankOnlyHint")');
    expect(page).not.toContain('Only verified bank destinations are enabled.');
  });
});

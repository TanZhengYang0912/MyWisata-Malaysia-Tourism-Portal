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

  it('uses only the server-resolved verified TNG phone', () => {
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

    expect(page).toContain('tngIdentity');
    expect(page).toContain('body: JSON.stringify({ type: "e_wallet" })');
    expect(page).toContain('tCustomer("ui.wallet.verifiedTngPhone"');
    expect(page).toContain('href="/customer/phone"');
    expect(page).not.toContain('phoneOrDuitNow');
    expect(page).not.toContain('tngIdentifier');
    expect(page).not.toContain('id="tng-destination"');
    expect(page).not.toContain('normalizeTngDestinationIdentifier');
  });
});

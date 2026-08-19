import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('wallet payout destination display contract', () => {
  it('uses server capabilities and does not promise unavailable TNG payouts', () => {
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

    expect(page).toContain('payoutCapabilities');
    expect(page).toContain('capabilities');
    expect(page).toContain('tCustomer("ui.wallet.bankOnlyHint")');
    expect(page).not.toContain('Only verified bank destinations are enabled. E-wallet payouts are not enabled yet.');
  });

  it('lets customers verify and save a TNG destination when the capability is enabled', () => {
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

    expect(page).toContain('tCustomer("ui.wallet.addTng")');
    expect(page).toContain('tCustomer("ui.wallet.tngIdentifier")');
    expect(page).toContain('handleAddTngDestination');
    expect(page).toContain('method: "POST"');
    expect(page).toContain('type: "e_wallet"');
    expect(page).toContain('setSelectedDestinationId(destination.id)');
  });

  it('allows the withdrawal form to open through the enabled TNG path without Stripe', () => {
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

    expect(page).toContain('payoutCapabilities.e_wallet.enabled');
    expect(page).toContain('const usesEnabledEwallet = payoutCapabilities.e_wallet.enabled && selectedDestination?.type === "e_wallet"');
    expect(page).toContain('if (usesEnabledEwallet)');
    expect(page).toContain('setShowWithdraw((v) => !v)');
  });
});

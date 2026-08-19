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

  it('ignores destination and withdrawal responses after the signed-in account changes', () => {
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
    const destinationHandler = page.slice(page.indexOf('async function handleAddTngDestination'), page.indexOf('async function handleWithdraw'));
    const withdrawalHandler = page.slice(page.indexOf('async function handleWithdraw'), page.indexOf('async function handleTopUp'));

    expect(page).toContain('currentUserIdRef.current = currentUser?.id ?? null');
    expect(destinationHandler).toContain('requestVersion !== walletRequestVersion.current || currentUserIdRef.current !== userId');
    expect(destinationHandler.indexOf('currentUserIdRef.current !== userId')).toBeLessThan(destinationHandler.indexOf('setDestinations'));
    expect(withdrawalHandler).toContain('requestVersion !== walletRequestVersion.current || currentUserIdRef.current !== userId');
    expect(withdrawalHandler.indexOf('currentUserIdRef.current !== userId')).toBeLessThan(withdrawalHandler.indexOf('setWithdrawals'));
  });
});

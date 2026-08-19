import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('customer wallet Stripe JIT contract', () => {
  const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

  it('uses the JIT visibility policy instead of loading Connect with wallet data', () => {
    expect(page).toContain('shouldExposeStripePayoutSetup');
    expect(page).toContain('withdrawSetupRequested');
    const walletLoadEffect = page.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[currentUser\]\);/)?.[1] ?? '';
    expect(walletLoadEffect).toContain('getMyWithdrawals(currentUser.id)');
    expect(walletLoadEffect).not.toContain('refreshConnectStatus');
  });

  it('shows accurate Stripe requirement states', () => {
    expect(page).toContain('currently_due');
    expect(page).toContain('pending_verification');
    expect(page).toContain('payouts_enabled');
    expect(page).toContain('past_due');
    expect(page).toContain('tCustomer("ui.wallet.stripeReviewing")');
    expect(page).toContain('tCustomer("ui.wallet.bankWithdrawalsRestricted")');
  });

  it('describes payout setup as optional and separate from top up', () => {
    expect(page).toContain('tCustomer("ui.wallet.optionalBankSetup")');
    expect(page).toContain('tCustomer("ui.wallet.stripePrivacy")');
  });

  it('disables withdrawal submission until available earnings exist', () => {
    expect(page).toContain('disabled={withdrawing || !walletReady || resolvedAvailableEarnings <= 0}');
  });
});

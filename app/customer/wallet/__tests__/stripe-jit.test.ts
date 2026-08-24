import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('customer wallet Stripe JIT contract', () => {
  const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
  const readiness = readFileSync(new URL('../../../../components/customer/wallet/payout-readiness.tsx', import.meta.url), 'utf8');

  it('uses the JIT visibility policy instead of loading Connect with wallet data', () => {
    expect(page).toContain('shouldExposeStripePayoutSetup');
    expect(page).toContain('withdrawSetupRequested');
    const refreshWalletState = page.match(/const refreshWalletState = useCallback\(async \(\) => \{([\s\S]*?)\}, \[currentUser\]\);/)?.[1] ?? '';
    expect(refreshWalletState).toContain('getMyWithdrawals(currentUser.id)');
    expect(refreshWalletState).not.toContain('refreshConnectStatus');
    expect(page).toContain('void refreshWalletState();');
  });

  it('shows payout readiness in one inline surface without a duplicate modal', () => {
    expect(page).toContain('<PayoutReadiness');
    expect(page).not.toContain('showConnectModal');
    expect(page).not.toContain('fixed inset-0 bg-black/50');
  });

  it('shows accurate Stripe requirement states', () => {
    expect(readiness).toContain('currently_due');
    expect(readiness).toContain('pending_verification');
    expect(readiness).toContain('payouts_enabled');
    expect(readiness).toContain('past_due');
    expect(readiness).toContain('t("ui.wallet.stripeReviewing")');
    expect(readiness).toContain('t("ui.wallet.bankWithdrawalsRestricted")');
  });

  it('describes payout setup as optional and separate from top up', () => {
    expect(readiness).toContain('t("ui.wallet.setupWhenWithdrawing")');
    expect(readiness).toContain('t("ui.wallet.stripePrivacy")');
  });

  it('blocks withdrawal submission while the TNG destination editor is unfinished', () => {
    expect(page).toContain('if (showAddTngDestination) return;');
    expect(page).toContain(
      'disabled={withdrawing || withdrawAmount.trim() === "" || showAddTngDestination || !walletReady || resolvedAvailableEarnings <= 0}',
    );
  });

  it('replaces stale top-up feedback with localized withdrawal success feedback', () => {
    const openWithdraw = page.match(/async function openWithdraw[\s\S]*?async function handleAddTngDestination/)?.[0] ?? '';
    const handleWithdraw = page.match(/async function handleWithdraw[\s\S]*?async function handleTopUp/)?.[0] ?? '';
    expect(page).toContain('const [withdrawalSubmitted, setWithdrawalSubmitted] = useState(false);');
    expect(openWithdraw).toContain('setWithdrawalSubmitted(false);');
    expect(handleWithdraw).toContain('setWithdrawalSubmitted(true);');
    expect(handleWithdraw).toContain('nextUrl.searchParams.delete("topup");');
    expect(handleWithdraw).toContain('window.history.replaceState(');
    expect(page).toContain('tCustomer("ui.wallet.withdrawalSubmitted")');
    expect(page).toContain('withdrawalSubmitted ? (');
    expect(page).toContain(': topupSuccess && (');
  });

  it('provides withdrawal-submitted feedback in every customer locale', () => {
    const expected = {
      en: 'Withdrawal request submitted successfully. It is now pending review.',
      ms: 'Permintaan pengeluaran berjaya dihantar. Permintaan ini kini menunggu semakan.',
      'zh-CN': '提现申请已成功提交，现正等待审核。',
    };

    for (const [locale, message] of Object.entries(expected)) {
      const resources = JSON.parse(readFileSync(`app/i18n/locales/${locale}/customer.json`, 'utf8')) as {
        ui: { wallet: { withdrawalSubmitted?: string } };
      };
      expect(resources.ui.wallet.withdrawalSubmitted).toBe(message);
    }
  });
});

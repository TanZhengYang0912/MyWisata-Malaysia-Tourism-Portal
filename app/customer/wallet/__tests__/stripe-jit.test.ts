import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('customer wallet Stripe JIT contract', () => {
  const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
  const readiness = readFileSync(new URL('../../../../components/customer/wallet/payout-readiness.tsx', import.meta.url), 'utf8');

  it('uses the JIT visibility policy instead of loading Connect with wallet data', () => {
    expect(page).toContain('shouldExposeStripePayoutSetup');
    expect(page).toContain('withdrawSetupRequested');
    const refreshWalletState = page.match(/const refreshWalletState = useCallback\(async \(destinationId: string\) => \{([\s\S]*?)\}, \[currentUser, refreshWalletSummary, tCustomer\]\);/)?.[1] ?? '';
    expect(refreshWalletState).toContain('getMyActiveWithdrawals(currentUser.id, withdrawalsController.signal)');
    expect(refreshWalletState).not.toContain('refreshConnectStatus');
    expect(page).toContain('void refreshWalletState(requestDestinationId ?? "");');
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
    expect(page).toContain('if (!existingPending && showAddTngDestination) return;');
    expect(page).toContain(
      '(!withdrawalOutcomePending && (!walletReady || resolvedAvailableEarnings <= 0 || !readiness?.canWithdraw))',
    );
  });

  it('refreshes server readiness for the selected payout destination', () => {
    expect(page).toContain('destinationId=${encodeURIComponent(destinationId)}');
    expect(page).toContain('refreshWalletSummary(nextDestinationId)');
    expect(page).toContain('if (!existingPending && !readiness?.canWithdraw)');
    expect(page).toContain('!readiness?.canWithdraw');
  });

  it('keeps the destination form reachable while payout setup is required', () => {
    const openWithdraw = page.match(/async function openWithdraw[\s\S]*?async function handleAddTngDestination/)?.[0] ?? '';
    expect(openWithdraw).toContain('const canOpenDestinationSetup');
    expect(openWithdraw).toContain('setShowWithdraw(true)');
  });

  it('replaces stale top-up feedback with localized withdrawal success feedback', () => {
    const openWithdraw = page.match(/async function openWithdraw[\s\S]*?async function handleAddTngDestination/)?.[0] ?? '';
    const handleWithdraw = page.match(/async function handleWithdraw[\s\S]*?async function handleTopUp/)?.[0] ?? '';
    expect(page).toContain('const [withdrawalSubmitted, setWithdrawalSubmitted] = useState(false);');
    expect(openWithdraw).toContain('setWithdrawalSubmitted(false);');
    expect(page).toContain('const completeWithdrawalSubmission = useCallback');
    expect(page).toContain('setWithdrawalSubmitted(true);');
    expect(page).toContain('nextUrl.searchParams.delete("topup");');
    expect(page).toContain('window.history.replaceState(');
    expect(handleWithdraw).toContain('completeWithdrawalSubmission();');
    expect(page).toContain('tCustomer("ui.wallet.withdrawalSubmitted")');
    expect(page).toContain('{withdrawalSubmitted ? (');
    expect(page).toContain(': topUpOperation?.state === "credited" && (');
    expect(page).toContain('tCustomer("ui.wallet.topupSuccess")');
  });

  it('uses one idempotency key and a bounded action timeout per withdrawal attempt', () => {
    const handleWithdraw = page.match(/async function handleWithdraw[\s\S]*?async function handleTopUp/)?.[0] ?? '';
    expect(page).toContain('const WITHDRAWAL_ACTION_TIMEOUT_MS = 15_000;');
    expect(handleWithdraw).toContain('const requestId = existingPending?.requestId ?? crypto.randomUUID();');
    expect(handleWithdraw).toContain('signal: controller.signal');
    expect(handleWithdraw).toContain('requestId');
    expect(handleWithdraw).toContain('controller.abort()');
  });

  it('reconciles an aborted submission by exact request UUID before allowing another attempt', () => {
    const reconciliation = page.match(/const reconcileWithdrawalRequest = useCallback[\s\S]*?const completeWithdrawalSubmission/)?.[0] ?? '';
    const handleWithdraw = page.match(/async function handleWithdraw[\s\S]*?async function handleTopUp/)?.[0] ?? '';
    expect(page).toContain('const [confirmingWithdrawal, setConfirmingWithdrawal] = useState(false);');
    expect(page).toContain('const WITHDRAWAL_RECONCILIATION_DELAYS_MS = [0, 1_500, 3_000] as const;');
    expect(reconciliation).toContain('if (accepted)');
    expect(reconciliation).toContain('getMyWithdrawalById(currentUserId, requestId, controller.signal)');
    expect(handleWithdraw).toContain('error.name === "AbortError"');
    expect(handleWithdraw).toContain('await reconcileWithdrawalRequest(requestId)');
    expect(page).toContain('tCustomer("ui.wallet.confirmingWithdrawal")');
    expect(page).toContain('tCustomer("ui.wallet.withdrawalOutcomeUnknown")');
  });

  it('keeps the same request identity through network errors and reconciles uncertain server outcomes', () => {
    const handleWithdraw = page.match(/async function handleWithdraw[\s\S]*?async function handleTopUp/)?.[0] ?? '';
    expect(handleWithdraw).toContain('error instanceof TypeError');
    expect(handleWithdraw).toContain('await reconcileWithdrawalRequest(requestId)');
    expect(handleWithdraw).toContain('pendingWithdrawalRequest.current');
    expect(handleWithdraw).toContain('sessionStorage.setItem');
    expect(handleWithdraw.indexOf('response.status >= 500')).toBeLessThan(handleWithdraw.indexOf('response.json()'));
  });

  it('uses the effective minimum returned by wallet summary instead of the fixed UI constant', () => {
    expect(page).toContain('minimumWithdrawalSen');
    expect(page).toContain('minimumWithdrawalRm');
    expect(page).toContain('min={minimumWithdrawalRm}');
    expect(page).toContain('minimumWithdrawalSen / 100');
    expect(page).not.toContain('amount < CUSTOMER_WITHDRAWAL_MINIMUM_RM');
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

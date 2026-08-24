"use client";

import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Wallet, CheckCircle2, Building2, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import {
  getMyWithdrawals,
} from "@/backend/domains/commerce";
import { Button } from "@/components/ui/button";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import type { WithdrawalRequest } from "@/backend/core/types";
import { getWithdrawalDisplayGroups } from "@/lib/wallet/withdrawal-display";
import { normalizeTngDestinationIdentifier, selectDefaultPayoutDestination, type PayoutDestination } from "@/lib/payouts/destinations";
import { CUSTOMER_WITHDRAWAL_MINIMUM_RM, shouldExposeStripePayoutSetup } from "@/lib/stripe/jit-visibility";
import { STRIPE_TOP_UP_MAXIMUM_RM, STRIPE_TOP_UP_MINIMUM_RM } from "@/lib/stripe/top-up-limits";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";
import { WalletBalanceSummary, type WalletBuckets } from "@/components/customer/wallet/wallet-balance-summary";
import { PayoutReadiness, type CustomerConnectStatus } from "@/components/customer/wallet/payout-readiness";
import { WithdrawalList } from "@/components/customer/wallet/withdrawal-list";
import type { CustomerWalletCapabilities } from "@/lib/wallet/customer-capabilities";
import { isSettlementPending, startSettlementPolling } from "@/lib/wallet/settlement-polling";


type ConnectStatus = CustomerConnectStatus;
type PayoutCapabilities = {
  bank_account: { enabled: boolean; provider: string };
  e_wallet: { enabled: boolean; provider: string | null };
};

function walletSummaryEndpoint(destinationId: string) {
  return destinationId
    ? `/api/wallet/summary?destinationId=${encodeURIComponent(destinationId)}`
    : "/api/wallet/summary";
}

function WalletContent() {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const { currentUser } = useAuth();
  const gate = useCustomerCapabilityGate();
  const searchParams     = useSearchParams();
  const topupSuccess     = searchParams.get("topup")      === "success";
  const onboardComplete  = searchParams.get("onboarding") === "complete";
  const onboardRefresh   = searchParams.get("onboarding") === "refresh";

  const [buckets, setBuckets]         = useState<WalletBuckets | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[] | null>(null);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("idle");
  const [readiness, setReadiness] = useState<CustomerWalletCapabilities | null>(null);

  // Withdrawal form
  const [showWithdraw, setShowWithdraw]   = useState(false);
  const [withdrawSetupRequested, setWithdrawSetupRequested] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing]     = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawalSubmitted, setWithdrawalSubmitted] = useState(false);
  const [destinations, setDestinations] = useState<PayoutDestination[]>([]);
  const [selectedDestinationId, setSelectedDestinationId] = useState("");
  const [showAddTngDestination, setShowAddTngDestination] = useState(false);
  const [tngIdentifier, setTngIdentifier] = useState("");
  const [addingTngDestination, setAddingTngDestination] = useState(false);
  const [tngDestinationError, setTngDestinationError] = useState("");
  const [payoutCapabilities, setPayoutCapabilities] = useState<PayoutCapabilities>({
    bank_account: { enabled: true, provider: "stripe_connect" },
    e_wallet: { enabled: false, provider: "tng_direct_credit" },
  });

  // Top-up form
  const [showTopUp, setShowTopUp]     = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [toppingUp, setToppingUp]     = useState(false);
  const [topUpError, setTopUpError]   = useState("");

  // Connect onboarding
  const [onboarding, setOnboarding] = useState(false);
  const [onboardError, setOnboardError] = useState("");

  const displayGroups = getWithdrawalDisplayGroups(withdrawals ?? [], buckets?.earnings ?? 0);
  const { pending, history, pendingTotal, availableEarnings } = displayGroups;
  const walletReady = buckets !== null && withdrawals !== null;
  const resolvedAvailableEarnings = walletReady ? availableEarnings : 0;
  const returningFromOnboarding = onboardComplete || onboardRefresh;
  const showPayoutSetup = shouldExposeStripePayoutSetup({
    availableEarningsRm: resolvedAvailableEarnings,
    withdrawRequested: withdrawSetupRequested,
    returningFromOnboarding,
  });
  const usesStripeDestination = readiness?.destinationSummary?.type !== "e_wallet";
  const topUpMaximumAmountLabel = STRIPE_TOP_UP_MAXIMUM_RM.toLocaleString(
    i18n.language === "en" ? "en-MY" : i18n.language,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );

  const refreshConnectStatus = useCallback(async (): Promise<ConnectStatus> => {
    if (!currentUser) return "idle";
    setConnectStatus("loading");
    setOnboardError("");
    try {
      const response = await fetch("/api/stripe/connect-status", { cache: "no-store" });
      const body = await response.json() as {
        data?: {
          accountId: string | null;
          tier: string;
          payoutsEnabled: boolean;
          payoutStatus: "unlinked" | "currently_due" | "pending_verification" | "payouts_enabled" | "past_due" | "restricted";
        };
        error?: { message?: string } | string;
      };
      if (!response.ok) {
        const message = typeof body.error === "string"
          ? body.error
          : body.error?.message ?? tCustomer("ui.wallet.verifyPayoutError");
        setOnboardError(message);
        setConnectStatus("status_error");
        return "status_error";
      }

      const data = body.data;
      const nextStatus: ConnectStatus = !data || data.tier !== "kyc_verified"
        ? "kyc_required"
        : !data.accountId
        ? "unlinked"
        : data.payoutStatus;
      setConnectStatus(nextStatus);
      return nextStatus;
    } catch {
      setOnboardError(tCustomer("ui.wallet.verifyPayoutError"));
      setConnectStatus("status_error");
      return "status_error";
    }
  }, [currentUser, tCustomer]);

  const refreshWalletSummary = useCallback(async (destinationId: string) => {
    const summaryResponse = await fetch(walletSummaryEndpoint(destinationId), { cache: "no-store" });
    const body = await summaryResponse.json() as {
      data?: {
        topupSen: number;
        earningsSen: number;
        pendingEarningsSen: number;
        reservedEarningsSen: number;
        withdrawnEarningsSen: number;
      } & CustomerWalletCapabilities;
    };
    const summary = summaryResponse.ok ? body.data : undefined;
    setBuckets(summary ? {
      topup: summary.topupSen / 100,
      earnings: summary.earningsSen / 100,
      pendingEarnings: summary.pendingEarningsSen / 100,
      reservedEarnings: summary.reservedEarningsSen / 100,
      withdrawnEarnings: summary.withdrawnEarningsSen / 100,
    } : null);
    const nextReadiness = summary ? {
      canWithdraw: summary.canWithdraw,
      blockerCode: summary.blockerCode,
      nextAction: summary.nextAction,
      destinationSummary: summary.destinationSummary,
      lastProviderCheckAt: summary.lastProviderCheckAt,
    } : null;
    setReadiness(nextReadiness);
    return nextReadiness;
  }, []);

  const refreshWalletState = useCallback(async (destinationId: string) => {
    if (!currentUser) return;
    const [, nextWithdrawals] = await Promise.all([
      refreshWalletSummary(destinationId),
      getMyWithdrawals(currentUser.id),
    ]);
    setWithdrawals(nextWithdrawals);
  }, [currentUser, refreshWalletSummary]);

  useEffect(() => {
    if (!currentUser) {
      setBuckets(null);
      setReadiness(null);
      setWithdrawals(null);
      setDestinations([]);
      setSelectedDestinationId("");
      return;
    }
    fetch("/api/wallet/destinations", { cache: "no-store" }).then((response) => response.json()).then((body) => {
      const nextDestinations = (body.data?.destinations ?? []) as PayoutDestination[];
      setDestinations(nextDestinations);
      if (body.data?.capabilities) setPayoutCapabilities(body.data.capabilities as PayoutCapabilities);
      const nextDestinationId = selectDefaultPayoutDestination(nextDestinations)?.id ?? "";
      setSelectedDestinationId(nextDestinationId);
      void refreshWalletState(nextDestinationId);
    }).catch(() => {
      setDestinations([]);
      setSelectedDestinationId("");
      void refreshWalletState("");
    });
  }, [currentUser, refreshWalletState]);

  useEffect(() => {
    if (!currentUser || !withdrawals?.some((withdrawal) => isSettlementPending(withdrawal.status))) return;
    return startSettlementPolling({
      refresh: () => refreshWalletState(selectedDestinationId),
      shouldContinue: () => withdrawals.some((withdrawal) => isSettlementPending(withdrawal.status)),
    });
  }, [currentUser, refreshWalletState, selectedDestinationId, withdrawals]);

  useEffect(() => {
    if (!currentUser) return;
    if (!returningFromOnboarding && (!walletReady || resolvedAvailableEarnings < CUSTOMER_WITHDRAWAL_MINIMUM_RM)) return;
    void refreshConnectStatus();
  }, [currentUser, refreshConnectStatus, resolvedAvailableEarnings, returningFromOnboarding, walletReady]);

  async function handleConnectOnboard() {
    if (!gate(CUSTOMER_CAPABILITY.WITHDRAWAL, "/customer/wallet")) return;
    setOnboarding(true);
    setOnboardError("");
    try {
      const res  = await fetch("/api/stripe/connect-onboard", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        const message = typeof data.error === "string"
          ? data.error
          : data.error?.message ?? tCustomer("ui.wallet.startStripeError");
        setOnboardError(message);
        setConnectStatus("status_error");
        return;
      }
      if (data.status === "verified") {
        await refreshConnectStatus();
        return;
      }
      if (data.status === "pending_verification" || data.status === "restricted") {
        setConnectStatus(data.status);
        return;
      }
      window.location.href = data.url;
    } catch {
      setOnboardError(tCustomer("ui.wallet.startOnboardingError"));
    } finally {
      setOnboarding(false);
    }
  }

  async function openWithdraw() {
    if (!gate(CUSTOMER_CAPABILITY.WITHDRAWAL, "/customer/wallet")) return;
    setWithdrawalSubmitted(false);
    setShowTopUp(false);
    setWithdrawError("");
    setWithdrawSetupRequested(true);

    if (!walletReady || !readiness) {
      setWithdrawError(tCustomer("ui.wallet.earningsLoadingError"));
      setShowWithdraw(false);
      return;
    }

    if (!readiness.canWithdraw) {
      const canOpenDestinationSetup = readiness.nextAction === "add_payout_destination"
        || readiness.nextAction === "complete_payout_setup"
        || readiness.nextAction === "wait_destination_cooldown";
      if (canOpenDestinationSetup) setShowWithdraw(true);
      else setShowWithdraw(false);
      if (readiness.nextAction === "complete_payout_setup") await refreshConnectStatus();
      return;
    }

    setShowWithdraw((value) => !value);
  }

  async function handleAddTngDestination() {
    if (!gate(CUSTOMER_CAPABILITY.WITHDRAWAL, "/customer/wallet")) return;
    const phoneOrDuitNow = tngIdentifier.trim();
    setTngDestinationError("");
    const normalized = normalizeTngDestinationIdentifier(phoneOrDuitNow);
    if (!normalized.ok) {
      setTngDestinationError(tCustomer("ui.wallet.invalidTngIdentifier"));
      return;
    }

    setAddingTngDestination(true);
    try {
      const response = await fetch("/api/wallet/destinations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "e_wallet", phoneOrDuitNow: normalized.value, label: "TNG eWallet" }),
      });
      const body = await response.json() as {
        data?: { destination?: PayoutDestination };
        error?: { message?: string } | string;
      };
      if (!response.ok || !body.data?.destination) {
        const message = typeof body.error === "string"
          ? body.error
          : body.error?.message ?? tCustomer("ui.wallet.verifyTngDetailsError");
        throw new Error(message);
      }

      const destination = body.data.destination;
      setDestinations((current) => [destination, ...current.filter((item) => item.id !== destination.id)]);
      setSelectedDestinationId(destination.id);
      await refreshWalletSummary(destination.id);
      setTngIdentifier("");
      setShowAddTngDestination(false);
    } catch (error) {
      setTngDestinationError(error instanceof Error
        ? error.message
        : tCustomer("ui.wallet.verifyTngError"));
    } finally {
      setAddingTngDestination(false);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser || !gate(CUSTOMER_CAPABILITY.WITHDRAWAL, "/customer/wallet")) return;
    if (showAddTngDestination) return;
    setWithdrawError("");
    if (!readiness?.canWithdraw) {
      setWithdrawError(tCustomer("ui.wallet.earningsLoadingError"));
      return;
    }
    const amount    = parseFloat(withdrawAmount);
    const available = availableEarnings;
    if (!amount || amount <= 0) { setWithdrawError(tCustomer("ui.wallet.validAmount")); return; }
    if (amount > available)     { setWithdrawError(tCustomer("ui.wallet.amountExceedsEarnings")); return; }
    if (amount < CUSTOMER_WITHDRAWAL_MINIMUM_RM) { setWithdrawError(tCustomer("ui.wallet.minimumWithdrawal", { amount: CUSTOMER_WITHDRAWAL_MINIMUM_RM.toFixed(2) })); return; }
    setWithdrawing(true);
    try {
      const response = await fetch('/api/wallet/withdrawals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountRm: withdrawAmount, ...(selectedDestinationId ? { destinationId: selectedDestinationId } : {}) }),
      });
      const body = await response.json() as { error?: { message?: string } | string };
      if (!response.ok) {
        throw new Error(typeof body.error === 'string' ? body.error : body.error?.message ?? tCustomer("ui.wallet.submitWithdrawalError"));
      }
      await refreshWalletState(selectedDestinationId);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("topup");
      window.history.replaceState(
        window.history.state,
        "",
        `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
      );
      setWithdrawalSubmitted(true);
      setShowWithdraw(false);
      setWithdrawAmount("");
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : tCustomer("ui.wallet.submitError"));
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleTopUp(e: React.FormEvent) {
    e.preventDefault();
    if (!gate(CUSTOMER_CAPABILITY.CHECKOUT, "/customer/wallet")) return;
    setTopUpError("");
    const amount = parseFloat(topUpAmount);
    if (!amount || amount <= 0 || !Number.isFinite(amount)) { setTopUpError(tCustomer("ui.wallet.validAmount")); return; }
    if (amount < STRIPE_TOP_UP_MINIMUM_RM) { setTopUpError(tCustomer("ui.wallet.minimumTopUp", { amount: STRIPE_TOP_UP_MINIMUM_RM.toFixed(2) })); return; }
    if (amount > STRIPE_TOP_UP_MAXIMUM_RM) { setTopUpError(tCustomer("ui.wallet.maximumTopUp", { amount: topUpMaximumAmountLabel })); return; }
    setToppingUp(true);
    try {
      const res  = await fetch("/api/stripe/create-checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ amount_rm: amount }),
      });
      const data = await res.json();
      if (!res.ok) { setTopUpError(data.error ?? tCustomer("ui.wallet.topUpError")); return; }
      window.location.href = data.url;
    } catch {
      setTopUpError(tCustomer("ui.wallet.topUpError"));
    } finally {
      setToppingUp(false);
    }
  }

  if (!currentUser) {
    return <CustomerPageShell><GuestAccountEmptyState title={tCustomer("ui.wallet.emptyTitle")} description={tCustomer("ui.wallet.emptyDescription")} nextPath="/customer/wallet" value="RM 0.00" /></CustomerPageShell>;
  }

  return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("accountGroups.account")}
        title={tCustomer("ui.wallet.title")}
        description={tCustomer("ui.wallet.description")}
        icon={<Wallet size={14} />}
      />

      <CustomerPageShell wide className="pt-0 sm:pt-0">

      {/* ── Banners ── */}
      {withdrawalSubmitted ? (
        <div className="mb-6 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{tCustomer("ui.wallet.withdrawalSubmitted")}</span>
        </div>
      ) : topupSuccess && (
        <div className="mb-6 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{tCustomer("ui.wallet.topupSuccess")}</span>
        </div>
      )}
      {onboardComplete && (
        <div className="mb-6 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{tCustomer("ui.wallet.bankSetupSubmitted")}</span>
        </div>
      )}
      {onboardRefresh && (
        <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3 text-amber-800 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>{tCustomer("ui.wallet.setupExpired")}</span>
        </div>
      )}

      <WalletBalanceSummary
        buckets={buckets}
        onTopUp={() => { if (!gate(CUSTOMER_CAPABILITY.CHECKOUT, "/customer/wallet")) return; setShowTopUp((value) => !value); setShowWithdraw(false); }}
        onWithdraw={() => void openWithdraw()}
      />

      {/* Stripe payout setup is intentionally hidden until a withdrawal-related JIT trigger. */}
      {showPayoutSetup && (!readiness?.canWithdraw || usesStripeDestination) && (
        <PayoutReadiness readiness={readiness} connectStatus={connectStatus} error={onboardError} busy={onboarding} onSetup={() => void handleConnectOnboard()} onRetry={() => void refreshConnectStatus()} />
      )}

      {/* ── Top-up form ── */}
      {showTopUp && (
        <form onSubmit={handleTopUp} className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-4">
          <h2 className="font-bold text-foreground">{tCustomer("ui.wallet.topUpCard")}</h2>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.wallet.amountRm")}</label>
            <input
              type="number" min={STRIPE_TOP_UP_MINIMUM_RM} max={STRIPE_TOP_UP_MAXIMUM_RM} step="0.01" required
              value={topUpAmount}
              onChange={(e) => { setTopUpAmount(e.target.value); setTopUpError(""); }}
              onInvalid={(e) => {
                if (e.currentTarget.validity.rangeOverflow) {
                  setTopUpError(tCustomer("ui.wallet.maximumTopUp", { amount: topUpMaximumAmountLabel }));
                }
              }}
              placeholder={tCustomer("ui.wallet.amountPlaceholder")}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-xs text-muted-foreground">{tCustomer("ui.wallet.maximumTopUp", { amount: topUpMaximumAmountLabel })}</p>
          </div>
          <p className="text-xs text-muted-foreground">{tCustomer("ui.wallet.stripeRedirect")}</p>
          {topUpError && <p className="text-xs text-red-500">{topUpError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={toppingUp} className="flex-1">
              {toppingUp ? tCustomer("ui.states.loading") : tCustomer("ui.wallet.continuePayment")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowTopUp(false)}>{tCustomer("ui.wallet.cancel")}</Button>
          </div>
        </form>
      )}

      {/* ── Withdrawal form ── */}
      {showWithdraw && (
        <form onSubmit={handleWithdraw} className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-4">
          <h2 className="font-bold text-foreground">{tCustomer("ui.wallet.requestWithdrawal")}</h2>

          {/* Earnings are already reduced by the submission RPC; reserved is shown separately. */}
          <div className="rounded-xl bg-muted/50 px-4 py-3 space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>{tCustomer("ui.wallet.earningsBalance")}</span>
              <span className="font-mono">{MYR_CODE} {(buckets?.earnings ?? 0).toFixed(2)}</span>
            </div>
            {pendingTotal > 0 && (
              <div className="flex justify-between text-amber-600">
                <span>{tCustomer("ui.wallet.reservedRequests")}</span>
                <span className="font-mono">{MYR_CODE} {pendingTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-foreground border-t border-border pt-1 mt-1">
              <span>{tCustomer("ui.wallet.availableWithdraw")}</span>
              <span className="font-mono">{MYR_CODE} {availableEarnings.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.wallet.amountRm")}</label>
            <input
              type="number" min="50" step="0.01" required
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder={tCustomer("ui.wallet.amountPlaceholder")}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.wallet.destination")}</label>
            {destinations.length > 0 ? (
              <select
                value={selectedDestinationId}
                onChange={(e) => {
                  const nextDestinationId = e.target.value;
                  setSelectedDestinationId(nextDestinationId);
                  setReadiness(null);
                  void refreshWalletSummary(nextDestinationId).then((nextReadiness) => {
                    if (nextReadiness?.nextAction === "complete_payout_setup") void refreshConnectStatus();
                  });
                }}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                {destinations.map((destination) => (
                  <option key={destination.id} value={destination.id} disabled={destination.status !== "verified"}>
                    {destination.displayLabel} {destination.status !== "verified" ? `(${tCustomer(`ui.wallet.destinationStatus.${destination.status}`)})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
                <Building2 size={14} className="shrink-0" />
                {tCustomer("ui.wallet.stripeBankOnFile")}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {payoutCapabilities.e_wallet.enabled
                ? tCustomer("ui.wallet.verifiedDestinationsHint")
                : tCustomer("ui.wallet.bankOnlyHint")}
            </p>
            {payoutCapabilities.e_wallet.enabled && (
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                {!showAddTngDestination ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { setShowAddTngDestination(true); setTngDestinationError(""); }}
                  >
                    {tCustomer("ui.wallet.addTng")}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label htmlFor="tng-destination" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {tCustomer("ui.wallet.tngIdentifier")}
                      </label>
                      <input
                        id="tng-destination"
                        type="text"
                        autoComplete="tel"
                        value={tngIdentifier}
                        onChange={(event) => setTngIdentifier(event.target.value)}
                        aria-invalid={Boolean(tngDestinationError)}
                        aria-describedby="tng-destination-help tng-destination-error"
                        placeholder={tCustomer("ui.wallet.tngPlaceholder")}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <p id="tng-destination-help" className="text-xs text-muted-foreground">{tCustomer("ui.wallet.tngSecurityHint")}</p>
                    {tngDestinationError && <p id="tng-destination-error" role="alert" className="text-xs text-red-500">{tngDestinationError}</p>}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => void handleAddTngDestination()} disabled={addingTngDestination}>
                        {addingTngDestination ? tCustomer("ui.wallet.verifying") : tCustomer("ui.wallet.verifySave")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { setShowAddTngDestination(false); setTngDestinationError(""); }}
                        disabled={addingTngDestination}
                      >
                        {tCustomer("ui.wallet.cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {parseFloat(withdrawAmount) >= 500 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {tCustomer("ui.wallet.dualApprovalWarning")}
            </p>
          )}
          {withdrawError && <p role="alert" className="text-xs text-red-500">{withdrawError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={withdrawing || withdrawAmount.trim() === "" || showAddTngDestination || !walletReady || resolvedAvailableEarnings <= 0 || !readiness?.canWithdraw} className="flex-1">
              {withdrawing ? tCustomer("ui.states.submitting") : tCustomer("ui.wallet.submitRequest")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowWithdraw(false)}>{tCustomer("ui.wallet.cancel")}</Button>
          </div>
        </form>
      )}

      <WithdrawalList pending={pending} history={history} />
      </CustomerPageShell>
    </>
  );
}

export default function WalletPage() {
  return (
    <Suspense>
      <WalletContent />
    </Suspense>
  );
}

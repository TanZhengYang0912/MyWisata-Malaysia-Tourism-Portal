"use client";

import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, Clock,
  CheckCircle2, XCircle, Building2, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import {
  getMyWithdrawals,
} from "@/backend/domains/commerce";
import { Button } from "@/components/ui/button";
import { CustomerPageShell, CustomerPageTitle, CustomerPanel } from "@/components/customer/customer-page-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import type { WithdrawalRequest } from "@/backend/core/types";
import { getWithdrawalDisplayGroups } from "@/lib/wallet/withdrawal-display";
import { normalizeTngDestinationIdentifier, selectDefaultPayoutDestination, type PayoutDestination } from "@/lib/payouts/destinations";
import { CUSTOMER_WITHDRAWAL_MINIMUM_RM, shouldExposeStripePayoutSetup } from "@/lib/stripe/jit-visibility";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";


type ConnectStatus =
  | "idle"
  | "loading"
  | "kyc_required"
  | "unlinked"
  | "currently_due"
  | "pending_verification"
  | "payouts_enabled"
  | "past_due"
  | "restricted"
  | "status_error";
type PayoutCapabilities = {
  bank_account: { enabled: boolean; provider: string };
  e_wallet: { enabled: boolean; provider: string | null };
};

function WalletContent() {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const { currentUser } = useAuth();
  const gate = useCustomerCapabilityGate();
  const searchParams     = useSearchParams();
  const topupSuccess     = searchParams.get("topup")      === "success";
  const onboardComplete  = searchParams.get("onboarding") === "complete";
  const onboardRefresh   = searchParams.get("onboarding") === "refresh";

  const [buckets, setBuckets]         = useState<{ topup: number; earnings: number; pendingEarnings: number; reservedEarnings: number; withdrawnEarnings: number } | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[] | null>(null);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("idle");

  // Withdrawal form
  const [showWithdraw, setShowWithdraw]   = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [withdrawSetupRequested, setWithdrawSetupRequested] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing]     = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
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
  const totalBalance = (buckets?.topup ?? 0) + (buckets?.earnings ?? 0);
  const returningFromOnboarding = onboardComplete || onboardRefresh;
  const showPayoutSetup = shouldExposeStripePayoutSetup({
    availableEarningsRm: resolvedAvailableEarnings,
    withdrawRequested: withdrawSetupRequested,
    returningFromOnboarding,
  });

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

  useEffect(() => {
    if (!currentUser) {
      setBuckets(null);
      setWithdrawals(null);
      setDestinations([]);
      setSelectedDestinationId("");
      return;
    }
    fetch('/api/wallet/summary').then((response) => response.json()).then((body) => {
      const summary = body.data as { topupSen: number; earningsSen: number; pendingEarningsSen: number; reservedEarningsSen: number; withdrawnEarningsSen: number } | undefined;
      setBuckets(summary ? {
        topup: summary.topupSen / 100,
        earnings: summary.earningsSen / 100,
        pendingEarnings: summary.pendingEarningsSen / 100,
        reservedEarnings: summary.reservedEarningsSen / 100,
        withdrawnEarnings: summary.withdrawnEarningsSen / 100,
      } : null);
    });
    getMyWithdrawals(currentUser.id).then(setWithdrawals);
    fetch("/api/wallet/destinations", { cache: "no-store" }).then((response) => response.json()).then((body) => {
      const nextDestinations = (body.data?.destinations ?? []) as PayoutDestination[];
      setDestinations(nextDestinations);
      if (body.data?.capabilities) setPayoutCapabilities(body.data.capabilities as PayoutCapabilities);
      setSelectedDestinationId(selectDefaultPayoutDestination(nextDestinations)?.id ?? "");
    }).catch(() => setDestinations([]));
  }, [currentUser]);

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
    const selectedDestination = destinations.find((destination) => destination.id === selectedDestinationId);
    setShowTopUp(false);
    setWithdrawError("");

    if (!walletReady) {
      setWithdrawError(tCustomer("ui.wallet.earningsLoadingError"));
      setShowWithdraw(true);
      return;
    }

    if (availableEarnings <= 0) {
      setWithdrawError(tCustomer("ui.wallet.noAvailableEarnings"));
      setShowWithdraw(true);
      return;
    }

    const usesEnabledEwallet = payoutCapabilities.e_wallet.enabled && selectedDestination?.type === "e_wallet";
    if (usesEnabledEwallet) {
      setShowWithdraw((v) => !v);
      return;
    }

    setWithdrawSetupRequested(true);
    const nextStatus = connectStatus === "idle" || connectStatus === "status_error"
      ? await refreshConnectStatus()
      : connectStatus;
    if (nextStatus === "payouts_enabled") setShowWithdraw((value) => !value);
    else setShowConnectModal(true);
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
    setWithdrawError("");
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
      const [nextWithdrawals, nextBuckets] = await Promise.all([
        getMyWithdrawals(currentUser.id),
        fetch('/api/wallet/summary').then((response) => response.json()),
      ]);
      setWithdrawals(nextWithdrawals);
      const summary = nextBuckets.data as { topupSen: number; earningsSen: number; pendingEarningsSen: number; reservedEarningsSen: number; withdrawnEarningsSen: number } | undefined;
      if (summary) setBuckets({
        topup: summary.topupSen / 100,
        earnings: summary.earningsSen / 100,
        pendingEarnings: summary.pendingEarningsSen / 100,
        reservedEarnings: summary.reservedEarningsSen / 100,
        withdrawnEarnings: summary.withdrawnEarningsSen / 100,
      });
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
    if (!amount || amount <= 0) { setTopUpError(tCustomer("ui.wallet.validAmount")); return; }
    if (amount < 1)              { setTopUpError(tCustomer("ui.wallet.minimumTopUp")); return; }
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

      <CustomerPageShell className="pt-0 sm:pt-0">

      {/* ── Banners ── */}
      {topupSuccess && (
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

      {/* ── Balance card ── */}
      <div
        className="mb-8 rounded-2xl p-6 text-white shadow-[0_18px_40px_rgba(1,0,102,0.16)] sm:p-7"
        style={{ background: "linear-gradient(135deg, #010066 0%, #1D2A8A 100%)" }}
      >
        <p className="text-sm opacity-75 mb-1">{tCustomer("ui.checkout.total")}</p>
        <p className="text-4xl font-bold font-[family-name:var(--font-mono)]">
          {buckets === null ? "—" : `RM ${totalBalance.toFixed(2)}`}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="min-h-[64px] rounded-xl bg-white/10 px-4 py-2">
            <p className="text-xs opacity-60">{tCustomer("ui.wallet.topupBalance")}</p>
            <p className="text-sm font-semibold font-[family-name:var(--font-mono)] mt-0.5">
              {buckets === null ? "—" : `RM ${buckets.topup.toFixed(2)}`}
            </p>
          </div>
          <div className="min-h-[64px] rounded-xl bg-white/10 px-4 py-2">
            <p className="text-xs opacity-60">{tCustomer("ui.wallet.earningsBalance")}</p>
            <p className="text-sm font-semibold font-[family-name:var(--font-mono)] mt-0.5">
              {buckets === null ? "—" : `RM ${buckets.earnings.toFixed(2)}`}
            </p>
          </div>
          <div className="min-h-[64px] rounded-xl bg-white/10 px-4 py-2">
            <p className="text-xs opacity-60">{tCustomer("ui.wallet.pendingRewards")}</p>
            <p className="text-sm font-semibold font-[family-name:var(--font-mono)] mt-0.5">
              {buckets === null ? "—" : `RM ${buckets.pendingEarnings.toFixed(2)}`}
            </p>
            <p className="mt-1 text-[10px] leading-snug opacity-60">{tCustomer("ui.wallet.pendingRewardsHint")}</p>
          </div>
          <div className="min-h-[64px] rounded-xl bg-white/10 px-4 py-2">
            <p className="text-xs opacity-60">{tCustomer("ui.wallet.reservedWithdrawals")}</p>
            <p className="text-sm font-semibold font-[family-name:var(--font-mono)] mt-0.5">
              {buckets === null ? "—" : `RM ${buckets.reservedEarnings.toFixed(2)}`}
            </p>
          </div>
          <div className="min-h-[64px] rounded-xl bg-white/10 px-4 py-2">
            <p className="text-xs opacity-60">{tCustomer("ui.wallet.withdrawnEarnings")}</p>
            <p className="text-sm font-semibold font-[family-name:var(--font-mono)] mt-0.5">
              {buckets === null ? "—" : `RM ${buckets.withdrawnEarnings.toFixed(2)}`}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
           <button
             onClick={() => { if (!gate(CUSTOMER_CAPABILITY.CHECKOUT, "/customer/wallet")) return; setShowTopUp((v) => !v); setShowWithdraw(false); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 transition text-sm font-semibold"
          >
            <ArrowUpCircle size={16} /> {tCustomer("ui.wallet.topUp")}
          </button>
          <button
            onClick={() => void openWithdraw()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 transition text-sm font-semibold"
          >
            <ArrowDownCircle size={16} /> {tCustomer("ui.wallet.withdraw")}
          </button>
        </div>
      </div>

      {/* Stripe payout setup is intentionally hidden until a withdrawal-related JIT trigger. */}
      {showPayoutSetup && (
        <CustomerPanel className="mb-8">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              connectStatus === "payouts_enabled" ? "bg-primary/15" :
              connectStatus === "currently_due" || connectStatus === "pending_verification" ? "bg-amber-100" :
              connectStatus === "past_due" || connectStatus === "restricted" || connectStatus === "status_error" ? "bg-red-100" : "bg-muted"
            }`}>
              {connectStatus === "payouts_enabled" ? <CheckCircle2 size={16} className="text-primary" /> :
               connectStatus === "currently_due" || connectStatus === "pending_verification" ? <Clock size={16} className="text-amber-600" /> :
               connectStatus === "past_due" || connectStatus === "restricted" || connectStatus === "status_error" ? <AlertCircle size={16} className="text-red-600" /> :
                                                                                                                        <Building2 size={16} className="text-muted-foreground" />}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {connectStatus === "payouts_enabled" ? tCustomer("ui.wallet.bankWithdrawalsEnabled") :
                 connectStatus === "currently_due" ? tCustomer("ui.wallet.completePayoutDetails") :
                 connectStatus === "pending_verification" ? tCustomer("ui.wallet.stripeVerificationProgress") :
                 connectStatus === "past_due" || connectStatus === "restricted" ? tCustomer("ui.wallet.bankWithdrawalsRestricted") :
                 connectStatus === "status_error" ? tCustomer("ui.wallet.unableVerifyPayout") :
                 connectStatus === "kyc_required" ? tCustomer("ui.wallet.completeKycFirst") :
                 connectStatus === "loading" || connectStatus === "idle" ? tCustomer("ui.wallet.checkingSetup") :
                 tCustomer("ui.wallet.setupEarningsOptional")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {connectStatus === "payouts_enabled" ? tCustomer("ui.wallet.approvedBankDestination") :
                 connectStatus === "currently_due" ? tCustomer("ui.wallet.stripeNeedsInfo") :
                 connectStatus === "pending_verification" ? tCustomer("ui.wallet.stripeReviewing") :
                 connectStatus === "past_due" || connectStatus === "restricted" ? tCustomer("ui.wallet.bankRestrictedDescription") :
                 connectStatus === "status_error" ? (onboardError || tCustomer("ui.wallet.retryStatus")) :
                 connectStatus === "kyc_required" ? tCustomer("ui.wallet.setupAfterKyc") :
                 connectStatus === "loading" || connectStatus === "idle" ? tCustomer("ui.wallet.checkingStripeStatus") :
                 tCustomer("ui.wallet.setupWhenWithdrawing")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{tCustomer("ui.wallet.stripePrivacy")}</p>
              {onboardError && <p className="text-xs text-red-500 mt-1">{onboardError}</p>}
            </div>

            {(connectStatus === "unlinked" || connectStatus === "currently_due" || connectStatus === "past_due") && (
              <Button size="sm" className="shrink-0" onClick={handleConnectOnboard} disabled={onboarding}>
                {onboarding ? tCustomer("ui.states.loading") : connectStatus === "unlinked" ? tCustomer("ui.wallet.setupWithdrawals") : tCustomer("ui.wallet.updateDetails")}
              </Button>
            )}
            {(connectStatus === "pending_verification" || connectStatus === "restricted" || connectStatus === "status_error") && (
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => void refreshConnectStatus()}>
                {tCustomer("ui.wallet.retryStatusCheck")}
              </Button>
            )}
          </div>
        </CustomerPanel>
      )}

      {/* ── Top-up form ── */}
      {showTopUp && (
        <form onSubmit={handleTopUp} className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-4">
          <h2 className="font-bold text-foreground">{tCustomer("ui.wallet.topUpCard")}</h2>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.wallet.amountRm")}</label>
            <input
              type="number" min="1" step="0.01" required
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              placeholder={tCustomer("ui.wallet.amountPlaceholder")}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
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
              <span className="font-mono">RM {(buckets?.earnings ?? 0).toFixed(2)}</span>
            </div>
            {pendingTotal > 0 && (
              <div className="flex justify-between text-amber-600">
                <span>{tCustomer("ui.wallet.reservedRequests")}</span>
                <span className="font-mono">RM {pendingTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-foreground border-t border-border pt-1 mt-1">
              <span>{tCustomer("ui.wallet.availableWithdraw")}</span>
              <span className="font-mono">RM {availableEarnings.toFixed(2)}</span>
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
                onChange={(e) => setSelectedDestinationId(e.target.value)}
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
            <Button type="submit" disabled={withdrawing || !walletReady || resolvedAvailableEarnings <= 0} className="flex-1">
              {withdrawing ? tCustomer("ui.states.submitting") : tCustomer("ui.wallet.submitRequest")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowWithdraw(false)}>{tCustomer("ui.wallet.cancel")}</Button>
          </div>
        </form>
      )}

      {/* ── JIT payout setup modal ── */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Building2 size={18} className="text-amber-600" />
              </div>
              <h2 className="font-bold text-foreground">
                {connectStatus === "pending_verification" ? tCustomer("ui.wallet.stripeVerificationProgress") :
                 connectStatus === "past_due" || connectStatus === "restricted" ? tCustomer("ui.wallet.bankWithdrawalsRestricted") :
                 connectStatus === "kyc_required" ? tCustomer("ui.wallet.completeKycFirst") :
                 tCustomer("ui.wallet.setupEarningsWithdrawals")}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {connectStatus === "kyc_required"
                ? tCustomer("ui.wallet.completeKycDescription")
                : connectStatus === "currently_due"
                ? tCustomer("ui.wallet.stripeNeedsInfoContinue")
                : connectStatus === "pending_verification"
                ? tCustomer("ui.wallet.stripeReviewing")
                : connectStatus === "past_due"
                ? tCustomer("ui.wallet.updateRestrictedDetails")
                : connectStatus === "restricted"
                ? tCustomer("ui.wallet.restrictedContactSupport")
                : connectStatus === "status_error"
                ? (onboardError || tCustomer("ui.wallet.verifyPayoutError"))
                : connectStatus === "loading" || connectStatus === "idle"
                ? tCustomer("ui.wallet.checkingPayoutSetup")
                : tCustomer("ui.wallet.optionalBankSetup")}
            </p>
            <p className="text-xs text-muted-foreground">{tCustomer("ui.wallet.stripePrivacy")}</p>
            {onboardError && <p className="text-xs text-red-500">{onboardError}</p>}
            <div className="flex gap-2">
              {(connectStatus === "unlinked" || connectStatus === "currently_due" || connectStatus === "past_due") && (
                <Button className="flex-1" onClick={() => { setShowConnectModal(false); void handleConnectOnboard(); }} disabled={onboarding}>
                  {onboarding
                    ? tCustomer("ui.states.loading")
                    : connectStatus === "unlinked" ? tCustomer("ui.wallet.setUpBankAccount") : tCustomer("ui.wallet.updateDetails")}
                </Button>
              )}
              {(connectStatus === "pending_verification" || connectStatus === "restricted" || connectStatus === "status_error") && (
                <Button className="flex-1" onClick={() => { setShowConnectModal(false); void refreshConnectStatus(); }}>
                  {tCustomer("ui.wallet.retryStatusCheck")}
                </Button>
              )}
              <Button variant="outline" className="flex-1" onClick={() => setShowConnectModal(false)}>
                {connectStatus === "kyc_required" ? tCustomer("ui.wallet.ok") : tCustomer("ui.wallet.later")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── In Progress ── */}
      {pending.length > 0 && (
        <div className="rounded-2xl overflow-hidden border border-border bg-card mb-4">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Clock size={14} className="text-accent" />
            <h2 className="font-bold text-foreground text-sm">
              {tCustomer("ui.wallet.inProgress", { count: pending.length })}
            </h2>
          </div>
          <div className="divide-y divide-border">
            {pending.map((w) => (
              <div key={w.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{w.destination}</p>
                  <p className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleDateString(i18n.language === "en" ? "en-MY" : i18n.language)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-foreground font-[family-name:var(--font-mono)]">RM {w.amount.toFixed(2)}</p>
                  <StatusBadge status={w.status} />
                  <Link href={`/customer/wallet/withdrawals/${w.id}`} className="mt-1 block text-xs text-primary hover:underline">{tCustomer("ui.wallet.viewReceipt")}</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Transaction history ── */}
      <div className="rounded-2xl overflow-hidden border border-border bg-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-bold text-foreground text-sm">{tCustomer("ui.wallet.transactionHistory")}</h2>
        </div>
        {history.length === 0 && pending.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">{tCustomer("ui.wallet.noTransactions")}</div>
        ) : history.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground">{tCustomer("ui.wallet.noCompletedTransactions")}</div>
        ) : (
          <div className="divide-y divide-border">
            {history.map((w) => (
              <div key={w.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {w.status === "completed" || w.status === "paid" || w.status === "approved" ? (
                    <CheckCircle2 size={16} className="text-primary shrink-0" />
                  ) : w.status === "failed" || w.status === "rejected" ? (
                    <XCircle size={16} className="text-destructive shrink-0" />
                  ) : (
                    <Clock size={16} className="text-accent shrink-0" />
                  )}
                  <div>
                    <p className="text-sm text-foreground">{w.destination}</p>
                    <p className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleDateString(i18n.language === "en" ? "en-MY" : i18n.language)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-foreground font-[family-name:var(--font-mono)]">RM {w.amount.toFixed(2)}</p>
                  <StatusBadge status={w.status} />
                  <Link href={`/customer/wallet/withdrawals/${w.id}`} className="mt-1 block text-xs text-primary hover:underline">{tCustomer("ui.wallet.viewReceipt")}</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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

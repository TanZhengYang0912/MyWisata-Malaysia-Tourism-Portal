"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, Clock,
  CheckCircle2, XCircle, Building2, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import {
  getMyWithdrawals, getWalletBuckets,
  requestWithdrawal, getConnectStatus,
} from "@/backend/domains/commerce";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import type { WithdrawalRequest } from "@/backend/core/types";


type ConnectStatus = "loading" | "kyc_required" | "unlinked" | "onboarding" | "verified";

function WalletContent() {
  const { currentUser } = useAuth();
  const searchParams     = useSearchParams();
  const topupSuccess     = searchParams.get("topup")      === "success";
  const onboardComplete  = searchParams.get("onboarding") === "complete";
  const onboardRefresh   = searchParams.get("onboarding") === "refresh";

  const [buckets, setBuckets]         = useState<{ topup: number; earnings: number } | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[] | null>(null);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("loading");

  // Withdrawal form
  const [showWithdraw, setShowWithdraw]   = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing]     = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  // Top-up form
  const [showTopUp, setShowTopUp]     = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [toppingUp, setToppingUp]     = useState(false);
  const [topUpError, setTopUpError]   = useState("");

  // Connect onboarding
  const [onboarding, setOnboarding] = useState(false);
  const [onboardError, setOnboardError] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    getWalletBuckets(currentUser.id).then(setBuckets);
    getMyWithdrawals(currentUser.id).then(setWithdrawals);
    getConnectStatus(currentUser.id).then(({ accountId, payoutsEnabled, tier }) => {
      if (tier !== "kyc_verified")    setConnectStatus("kyc_required");
      else if (!accountId)            setConnectStatus("unlinked");
      else if (payoutsEnabled)        setConnectStatus("verified");
      else                            setConnectStatus("onboarding");
    });
  }, [currentUser]);

  async function handleConnectOnboard() {
    setOnboarding(true);
    setOnboardError("");
    try {
      const res  = await fetch("/api/stripe/connect-onboard", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setOnboardError(data.error ?? "Failed to start onboarding."); return; }
      window.location.href = data.url;
    } catch {
      setOnboardError("Failed to start onboarding.");
    } finally {
      setOnboarding(false);
    }
  }

  function openWithdraw() {
    if (connectStatus !== "verified") {
      setShowConnectModal(true);
    } else {
      setShowWithdraw((v) => !v);
      setShowTopUp(false);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setWithdrawError("");
    const amount    = parseFloat(withdrawAmount);
    const available = availableEarnings;
    if (!amount || amount <= 0) { setWithdrawError("Enter a valid amount."); return; }
    if (amount > available)     { setWithdrawError("Amount exceeds your available earnings."); return; }
    if (amount < 50)            { setWithdrawError("Minimum withdrawal is RM 50.00."); return; }
    setWithdrawing(true);
    try {
      const w = await requestWithdrawal(currentUser.id, amount);
      setWithdrawals((prev) => [w, ...(prev ?? [])]);
      setBuckets((b) => b ? { ...b, earnings: b.earnings - amount } : b);
      setShowWithdraw(false);
      setWithdrawAmount("");
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleTopUp(e: React.FormEvent) {
    e.preventDefault();
    setTopUpError("");
    const amount = parseFloat(topUpAmount);
    if (!amount || amount <= 0) { setTopUpError("Enter a valid amount."); return; }
    if (amount < 1)              { setTopUpError("Minimum top-up is RM 1.00."); return; }
    setToppingUp(true);
    try {
      const res  = await fetch("/api/stripe/create-checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ amount_rm: amount }),
      });
      const data = await res.json();
      if (!res.ok) { setTopUpError(data.error ?? "Failed to initiate top-up."); return; }
      window.location.href = data.url;
    } catch {
      setTopUpError("Failed to initiate top-up.");
    } finally {
      setToppingUp(false);
    }
  }

  const totalBalance      = (buckets?.topup ?? 0) + (buckets?.earnings ?? 0);
  const pending           = (withdrawals ?? []).filter((w) => w.status === "pending");
  const processing        = (withdrawals ?? []).filter((w) => w.status === "processing");
  const history           = (withdrawals ?? []).filter((w) => !["pending", "processing"].includes(w.status));
  // Task 23: client-side hint — earnings already debited on submit, but show pending total for clarity
  const pendingTotal      = pending.reduce((s, w) => s + w.amount, 0);
  const availableEarnings = Math.max(0, (buckets?.earnings ?? 0) - pendingTotal);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Wallet size={28} className="text-primary" />
        <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">My Wallet</h1>
      </div>

      {/* ── Banners ── */}
      {topupSuccess && (
        <div className="mb-6 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>Top-up initiated! Your balance will update once the payment clears (usually within a minute).</span>
        </div>
      )}
      {onboardComplete && (
        <div className="mb-6 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>Bank account setup submitted. Stripe will verify your details — this may take a few minutes.</span>
        </div>
      )}
      {onboardRefresh && (
        <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3 text-amber-800 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>Setup link expired. Please try again.</span>
        </div>
      )}

      {/* ── Balance card ── */}
      <div
        className="rounded-2xl p-6 mb-6 text-white"
        style={{ background: "linear-gradient(135deg, #0F5D4A 0%, #087E8B 100%)" }}
      >
        <p className="text-sm opacity-75 mb-1">Total Spendable Balance</p>
        <p className="text-4xl font-bold font-[family-name:var(--font-mono)]">
          {buckets === null ? "—" : `RM ${totalBalance.toFixed(2)}`}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/10 px-4 py-2">
            <p className="text-xs opacity-60">Top-up balance</p>
            <p className="text-sm font-semibold font-[family-name:var(--font-mono)] mt-0.5">
              {buckets === null ? "—" : `RM ${buckets.topup.toFixed(2)}`}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-2">
            <p className="text-xs opacity-60">Earnings (withdrawable)</p>
            <p className="text-sm font-semibold font-[family-name:var(--font-mono)] mt-0.5">
              {buckets === null ? "—" : `RM ${buckets.earnings.toFixed(2)}`}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={() => { setShowTopUp((v) => !v); setShowWithdraw(false); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 transition text-sm font-semibold"
          >
            <ArrowUpCircle size={16} /> Top Up
          </button>
          <button
            onClick={openWithdraw}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 transition text-sm font-semibold"
          >
            <ArrowDownCircle size={16} /> Withdraw
          </button>
        </div>
      </div>

      {/* ── Connect status card (Task 18) ── */}
      {connectStatus !== "loading" && (
        <div className="rounded-2xl border border-border bg-card p-5 mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              connectStatus === "verified"    ? "bg-primary/15" :
              connectStatus === "onboarding"  ? "bg-amber-100"  : "bg-muted"
            }`}>
              {connectStatus === "verified"   ? <CheckCircle2 size={16} className="text-primary" /> :
               connectStatus === "onboarding" ? <Clock        size={16} className="text-amber-600" /> :
                                                <Building2    size={16} className="text-muted-foreground" />}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {connectStatus === "verified"     ? "Bank account connected"          :
                 connectStatus === "onboarding"   ? "Bank account setup in progress"  :
                 connectStatus === "kyc_required" ? "KYC verification required"       :
                                                    "No bank account linked"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {connectStatus === "verified"     ? "Withdrawal payouts go to your linked account." :
                 connectStatus === "onboarding"   ? "Complete Stripe setup to enable withdrawals."  :
                 connectStatus === "kyc_required" ? "Complete KYC to link a payout account."        :
                                                    "Required to receive withdrawal payouts."}
              </p>
              {onboardError && <p className="text-xs text-red-500 mt-1">{onboardError}</p>}
            </div>

            {(connectStatus === "unlinked" || connectStatus === "onboarding") && (
              <Button size="sm" className="shrink-0" onClick={handleConnectOnboard} disabled={onboarding}>
                {onboarding          ? "Loading…"         :
                 connectStatus === "onboarding" ? "Continue Setup" : "Get Started"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Top-up form ── */}
      {showTopUp && (
        <form onSubmit={handleTopUp} className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-4">
          <h2 className="font-bold text-foreground">Top Up via Card</h2>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount (RM)</label>
            <input
              type="number" min="1" step="0.01" required
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              placeholder="e.g. 50.00"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <p className="text-xs text-muted-foreground">You will be redirected to Stripe&apos;s secure payment page.</p>
          {topUpError && <p className="text-xs text-red-500">{topUpError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={toppingUp} className="flex-1">
              {toppingUp ? "Redirecting…" : "Continue to Payment"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowTopUp(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {/* ── Withdrawal form ── */}
      {showWithdraw && (
        <form onSubmit={handleWithdraw} className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-4">
          <h2 className="font-bold text-foreground">Request Withdrawal</h2>

          {/* Task 23: available balance hint */}
          <div className="rounded-xl bg-muted/50 px-4 py-3 space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Earnings balance</span>
              <span className="font-mono">RM {(buckets?.earnings ?? 0).toFixed(2)}</span>
            </div>
            {pendingTotal > 0 && (
              <div className="flex justify-between text-amber-600">
                <span>In-progress requests</span>
                <span className="font-mono">− RM {pendingTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-foreground border-t border-border pt-1 mt-1">
              <span>Available to withdraw</span>
              <span className="font-mono">RM {availableEarnings.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount (RM)</label>
            <input
              type="number" min="50" step="0.01" required
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="e.g. 50.00"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Task 22: destination is always Stripe bank on file */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Destination</label>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
              <Building2 size={14} className="shrink-0" />
              Stripe bank on file
            </div>
          </div>

          {parseFloat(withdrawAmount) >= 500 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠ Withdrawals ≥ RM 500 require dual approval and may take longer to process.
            </p>
          )}
          {withdrawError && <p className="text-xs text-red-500">{withdrawError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={withdrawing} className="flex-1">
              {withdrawing ? "Submitting…" : "Submit Request"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowWithdraw(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {/* ── JIT intercept modal (Task 19) ── */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Building2 size={18} className="text-amber-600" />
              </div>
              <h2 className="font-bold text-foreground">Bank account required</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {connectStatus === "kyc_required"
                ? "You need to complete KYC verification before setting up a payout account."
                : connectStatus === "onboarding"
                ? "Your Stripe bank account setup is not yet complete. Continue setup to enable withdrawals."
                : "Link a bank account via Stripe to receive withdrawal payouts."}
            </p>
            {onboardError && <p className="text-xs text-red-500">{onboardError}</p>}
            <div className="flex gap-2">
              {connectStatus !== "kyc_required" && (
                <Button className="flex-1" onClick={() => { setShowConnectModal(false); handleConnectOnboard(); }} disabled={onboarding}>
                  {onboarding
                    ? "Loading…"
                    : connectStatus === "onboarding" ? "Continue Setup" : "Set Up Bank Account"}
                </Button>
              )}
              <Button variant="outline" className="flex-1" onClick={() => setShowConnectModal(false)}>
                {connectStatus === "kyc_required" ? "OK" : "Later"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── In Progress ── */}
      {(pending.length > 0 || processing.length > 0) && (
        <div className="rounded-2xl overflow-hidden border border-border bg-card mb-4">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Clock size={14} className="text-accent" />
            <h2 className="font-bold text-foreground text-sm">
              In Progress ({pending.length + processing.length})
            </h2>
          </div>
          <div className="divide-y divide-border">
            {[...pending, ...processing].map((w) => (
              <div key={w.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{w.destination}</p>
                  <p className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleDateString("en-MY")}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-foreground font-[family-name:var(--font-mono)]">RM {w.amount.toFixed(2)}</p>
                  <StatusBadge status={w.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Transaction history ── */}
      <div className="rounded-2xl overflow-hidden border border-border bg-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-bold text-foreground text-sm">Transaction History</h2>
        </div>
        {history.length === 0 && pending.length === 0 && processing.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">No transactions yet.</div>
        ) : history.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground">No completed transactions yet.</div>
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
                    <p className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleDateString("en-MY")}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-foreground font-[family-name:var(--font-mono)]">RM {w.amount.toFixed(2)}</p>
                  <StatusBadge status={w.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense>
      <WalletContent />
    </Suspense>
  );
}

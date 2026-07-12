"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Wallet, ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getMyWithdrawals, getWalletBuckets, requestWithdrawal } from "@/backend/domains/commerce";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import type { WithdrawalRequest } from "@/backend/core/types";

const DESTINATIONS = ["Maybank", "CIMB", "Public Bank", "Touch 'n Go eWallet", "GrabPay", "Boost"];

function WalletContent() {
  const { currentUser } = useAuth();
  const searchParams = useSearchParams();
  const topupSuccess = searchParams.get("topup") === "success";

  const [buckets, setBuckets]       = useState<{ topup: number; earnings: number } | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[] | null>(null);

  // Withdrawal form state
  const [showWithdraw, setShowWithdraw]   = useState(false);
  const [withdrawForm, setWithdrawForm]   = useState({ amount: "", destination: DESTINATIONS[0] });
  const [withdrawing, setWithdrawing]     = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  // Top-up form state
  const [showTopUp, setShowTopUp]   = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [toppingUp, setToppingUp]   = useState(false);
  const [topUpError, setTopUpError] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    getWalletBuckets(currentUser.id).then(setBuckets);
    getMyWithdrawals(currentUser.id).then(setWithdrawals);
  }, [currentUser]);

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setWithdrawError("");
    const amount = parseFloat(withdrawForm.amount);
    const earnings = buckets?.earnings ?? 0;
    if (!amount || amount <= 0)   { setWithdrawError("Enter a valid amount."); return; }
    if (amount > earnings)         { setWithdrawError("Amount exceeds your withdrawable earnings balance."); return; }
    if (amount < 50)               { setWithdrawError("Minimum withdrawal is RM 50.00."); return; }
    setWithdrawing(true);
    try {
      const w = await requestWithdrawal(currentUser.id, amount, withdrawForm.destination);
      setWithdrawals((prev) => [w, ...(prev ?? [])]);
      setBuckets((b) => b ? { ...b, earnings: b.earnings - amount } : b);
      setShowWithdraw(false);
      setWithdrawForm({ amount: "", destination: DESTINATIONS[0] });
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
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_rm: amount }),
      });
      const data = await res.json();
      if (!res.ok) { setTopUpError(data.error ?? "Failed to initiate top-up."); return; }
      window.location.href = data.url;
    } catch (err) {
      setTopUpError(err instanceof Error ? err.message : "Failed to initiate top-up.");
    } finally {
      setToppingUp(false);
    }
  }

  const totalBalance   = (buckets?.topup ?? 0) + (buckets?.earnings ?? 0);
  const pending        = (withdrawals ?? []).filter((w) => w.status === "pending");
  const history        = (withdrawals ?? []).filter((w) => w.status !== "pending");

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Wallet size={28} className="text-primary" />
        <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">My Wallet</h1>
      </div>

      {/* Top-up success banner */}
      {topupSuccess && (
        <div className="mb-6 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>Top-up initiated! Your balance will update once the payment clears (usually within a minute).</span>
        </div>
      )}

      {/* Balance card */}
      <div
        className="rounded-2xl p-6 mb-8 text-white"
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
              {buckets === null ? "—" : `RM ${(buckets.topup).toFixed(2)}`}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-2">
            <p className="text-xs opacity-60">Earnings (withdrawable)</p>
            <p className="text-sm font-semibold font-[family-name:var(--font-mono)] mt-0.5">
              {buckets === null ? "—" : `RM ${(buckets.earnings).toFixed(2)}`}
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
            onClick={() => { setShowWithdraw((v) => !v); setShowTopUp(false); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 transition text-sm font-semibold"
          >
            <ArrowDownCircle size={16} /> Withdraw
          </button>
        </div>
      </div>

      {/* Top-up form */}
      {showTopUp && (
        <form onSubmit={handleTopUp} className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-4">
          <h2 className="font-bold text-foreground">Top Up via Card</h2>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount (RM)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              required
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              placeholder="e.g. 50.00"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            You will be redirected to Stripe&apos;s secure payment page.
          </p>
          {topUpError && <p className="text-xs text-red-500">{topUpError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={toppingUp} className="flex-1">
              {toppingUp ? "Redirecting…" : "Continue to Payment"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowTopUp(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {/* Withdrawal form */}
      {showWithdraw && (
        <form onSubmit={handleWithdraw} className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-4">
          <h2 className="font-bold text-foreground">Request Withdrawal</h2>
          <p className="text-xs text-muted-foreground">
            Only your earnings balance (RM {(buckets?.earnings ?? 0).toFixed(2)}) is withdrawable.
            Top-up balance can only be used for purchases.
          </p>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount (RM)</label>
            <input
              type="number"
              min="50"
              step="0.01"
              required
              value={withdrawForm.amount}
              onChange={(e) => setWithdrawForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="e.g. 50.00"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Destination</label>
            <select
              value={withdrawForm.destination}
              onChange={(e) => setWithdrawForm((f) => ({ ...f, destination: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              {DESTINATIONS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>

          {parseFloat(withdrawForm.amount) >= 500 && (
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

      {/* Pending withdrawals */}
      {pending.length > 0 && (
        <div className="rounded-2xl overflow-hidden border border-border bg-card mb-4">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Clock size={14} className="text-accent" />
            <h2 className="font-bold text-foreground text-sm">Pending ({pending.length})</h2>
          </div>
          <div className="divide-y divide-border">
            {pending.map((w) => (
              <div key={w.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{w.destination}</p>
                  <p className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleDateString("en-MY")}</p>
                </div>
                <p className="font-bold text-foreground font-[family-name:var(--font-mono)]">RM {w.amount.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div className="rounded-2xl overflow-hidden border border-border bg-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-bold text-foreground text-sm">Transaction History</h2>
        </div>
        {history.length === 0 && pending.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">No transactions yet.</div>
        ) : history.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground">No completed transactions yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {history.map((w) => (
              <div key={w.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {w.status === "approved" ? (
                    <CheckCircle2 size={16} className="text-primary shrink-0" />
                  ) : (
                    <XCircle size={16} className="text-destructive shrink-0" />
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

"use client";

import { useEffect, useState } from "react";
import { Wallet, ArrowDownCircle, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getMyWithdrawals, getWalletBalance, requestWithdrawal } from "@/backend/domains/commerce";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import type { WithdrawalRequest } from "@/backend/core/types";

const DESTINATIONS = ["Maybank", "CIMB", "Public Bank", "Touch 'n Go eWallet", "GrabPay", "Boost"];

export default function WalletPage() {
  const { currentUser } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", destination: DESTINATIONS[0] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    getWalletBalance(currentUser.id).then(setBalance);
    getMyWithdrawals(currentUser.id).then(setWithdrawals);
  }, [currentUser]);

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setError("");
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { setError("Enter a valid amount."); return; }
    if (balance !== null && amount > balance) { setError("Amount exceeds available balance."); return; }
    setSubmitting(true);
    try {
      const w = await requestWithdrawal(currentUser.id, amount, form.destination);
      setWithdrawals((prev) => [w, ...(prev ?? [])]);
      setBalance((b) => (b ?? 0) - amount);
      setShowForm(false);
      setForm({ amount: "", destination: DESTINATIONS[0] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  const pending = (withdrawals ?? []).filter((w) => w.status === "pending");
  const history = (withdrawals ?? []).filter((w) => w.status !== "pending");

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Wallet size={28} className="text-primary" />
        <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">My Wallet</h1>
      </div>

      {/* Balance card */}
      <div
        className="rounded-2xl p-6 mb-8 text-white"
        style={{ background: "linear-gradient(135deg, #0F5D4A 0%, #087E8B 100%)" }}
      >
        <p className="text-sm opacity-75 mb-1">Available Balance</p>
        <p className="text-4xl font-bold font-[family-name:var(--font-mono)]">
          {balance === null ? "—" : `RM ${balance.toFixed(2)}`}
        </p>
        <p className="text-xs opacity-60 mt-2">Earnings from recommendations &amp; commissions</p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="mt-5 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 transition text-sm font-semibold"
        >
          <ArrowDownCircle size={16} /> Withdraw
        </button>
      </div>

      {/* Withdrawal form */}
      {showForm && (
        <form onSubmit={handleWithdraw} className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-4">
          <h2 className="font-bold text-foreground">Request Withdrawal</h2>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount (RM)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="e.g. 50.00"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Destination</label>
            <select
              value={form.destination}
              onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              {DESTINATIONS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>

          {parseFloat(form.amount) >= 500 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠ Withdrawals ≥ RM 500 require dual approval and may take longer to process.
            </p>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? "Submitting…" : "Submit Request"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
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

"use client";

import { useEffect, useState } from "react";
import { ArrowDownCircle, CheckCircle2, Clock, Wallet, X, XCircle } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getWalletBalance, getMyWithdrawals, requestWithdrawal } from "@/backend/domains/commerce";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import type { WithdrawalRequest } from "@/backend/core/types";

const MIN_WITHDRAWAL = 50;
const DESTINATIONS = [
  "Maybank **** 1234",
  "CIMB **** 5678",
  "Public Bank **** 9012",
  "Touch 'n Go eWallet",
  "GrabPay",
  "Boost",
];

export default function VendorWalletPage() {
  const { currentUser } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ amount: "", destination: DESTINATIONS[0] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    getWalletBalance(currentUser.id).then(setBalance);
    getMyWithdrawals(currentUser.id).then(setWithdrawals);
  }, [currentUser]);

  const pending = (withdrawals ?? []).filter((w) => w.status === "pending");
  const history = (withdrawals ?? []).filter((w) => w.status !== "pending");
  const pendingAmount = pending.reduce((s, w) => s + w.amount, 0);
  const available = Math.max(0, balance - pendingAmount);

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setError("");
    const amount = parseFloat(form.amount);
    if (!amount || amount < MIN_WITHDRAWAL) {
      setError(`Minimum withdrawal is RM ${MIN_WITHDRAWAL.toFixed(2)}.`);
      return;
    }
    if (amount > available) {
      setError("Insufficient available balance.");
      return;
    }
    setSubmitting(true);
    try {
      const w = await requestWithdrawal(currentUser.id, amount);
      setWithdrawals((prev) => [w, ...(prev ?? [])]);
      setShowModal(false);
      setForm({ amount: "", destination: DESTINATIONS[0] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const amountNum = parseFloat(form.amount) || 0;
  const amountExceedsBalance = amountNum > available;
  const amountBelowMin = amountNum > 0 && amountNum < MIN_WITHDRAWAL;

  return (
    <div className="p-6 sm:p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Wallet size={24} className="text-primary" />
          <div>
            <h1 className="font-bold text-lg text-foreground">Wallet &amp; Earnings</h1>
            <p className="text-xs text-muted-foreground">Request payouts and track approval status</p>
          </div>
        </div>
        <Button onClick={() => setShowModal(true)} className="flex items-center gap-2">
          <ArrowDownCircle size={15} /> Request Withdrawal
        </Button>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-2xl p-5 text-white" style={{ background: "linear-gradient(135deg, var(--primary) 0%, #11115A 100%)", boxShadow: "0 4px 20px rgba(0,0,77,0.28)" }}>
          <p className="text-xs opacity-70 mb-1">Total Balance</p>
          <p className="text-2xl font-bold font-[family-name:var(--font-mono)]">RM {balance.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl p-5 bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs text-muted-foreground mb-1">Available</p>
          <p className="text-2xl font-bold text-primary font-[family-name:var(--font-mono)]">RM {available.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Ready to withdraw</p>
        </div>
        <div className="rounded-2xl p-5 bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs text-muted-foreground mb-1">Pending Approval</p>
          <p className="text-2xl font-bold text-amber-600 font-[family-name:var(--font-mono)]">RM {pendingAmount.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{pending.length} request{pending.length !== 1 ? "s" : ""} in review</p>
        </div>
      </div>

      {/* Pending withdrawals */}
      {pending.length > 0 && (
        <div className="rounded-2xl overflow-hidden bg-card mb-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Clock size={14} className="text-amber-500" />
            <h2 className="font-bold text-foreground text-sm">Pending Approval ({pending.length})</h2>
          </div>
          <div className="divide-y divide-border">
            {pending.map((w) => (
              <div key={w.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{w.destination}</p>
                  <p className="text-xs text-muted-foreground">Submitted {new Date(w.createdAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}</p>
                  {w.requiresDualApproval && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 mt-1 inline-block">Dual Approval Required</span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-foreground font-[family-name:var(--font-mono)]">RM {w.amount.toFixed(2)}</p>
                  <StatusBadge status={w.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-bold text-foreground text-sm">Transaction History</h2>
        </div>
        {history.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Wallet size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">No completed transactions yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {history.map((w) => (
              <div key={w.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {w.status === "approved" ? (
                    <CheckCircle2 size={18} className="text-primary shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-destructive shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">{w.destination}</p>
                    <p className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold font-[family-name:var(--font-mono)]" style={{ color: w.status === "approved" ? "var(--primary)" : "var(--destructive)" }}>
                    RM {w.amount.toFixed(2)}
                  </p>
                  <StatusBadge status={w.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Withdrawal modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg text-foreground">Request Withdrawal</h2>
              <button onClick={() => { setShowModal(false); setError(""); }} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            {/* Available balance banner */}
            <div className="rounded-xl px-4 py-3 mb-5 flex items-center justify-between" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)" }}>
              <p className="text-xs text-muted-foreground">Available to withdraw</p>
              <p className="font-bold text-primary font-[family-name:var(--font-mono)]">RM {available.toFixed(2)}</p>
            </div>

            <form onSubmit={handleWithdraw} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount (RM)</label>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, amount: available.toFixed(2) }))}
                    className="text-[10px] font-bold text-primary hover:underline"
                  >
                    Withdraw All
                  </button>
                </div>
                <input
                  type="number"
                  min={MIN_WITHDRAWAL}
                  step="0.01"
                  required
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder={`Min RM ${MIN_WITHDRAWAL.toFixed(2)}`}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none transition-all"
                  style={{
                    borderColor: amountExceedsBalance || amountBelowMin ? "var(--destructive)" : "var(--border)",
                    backgroundColor: "var(--background)",
                    color: "var(--foreground)",
                  }}
                />
                {amountExceedsBalance && (
                  <p className="text-xs text-destructive">Insufficient available balance.</p>
                )}
                {amountBelowMin && (
                  <p className="text-xs text-destructive">Minimum withdrawal is RM {MIN_WITHDRAWAL.toFixed(2)}.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payout Destination</label>
                <select
                  value={form.destination}
                  onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-border outline-none"
                  style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}
                >
                  {DESTINATIONS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>

              {parseFloat(form.amount) >= 500 && (
                <div className="rounded-xl px-3 py-2.5 text-xs text-amber-700 bg-amber-50 border border-amber-200">
                  ⚠ Withdrawals ≥ RM 500 require dual approval and may take 2–3 additional business days.
                </div>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={submitting || amountExceedsBalance || amountBelowMin} className="flex-1">
                  {submitting ? "Submitting…" : "Submit Request"}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowModal(false); setError(""); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

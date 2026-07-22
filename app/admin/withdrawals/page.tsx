"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, ShieldAlert, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { isWalletReasonCategory, WALLET_REASON_CATEGORIES as WALLET_REASON_RULES, type WalletReasonAction } from "@/lib/validation/wallet-reason-schemas";

type ListItem = {
  id: string; userId: string; customerDisplayName: string; amountSen: number;
  status: string; requiresDualApproval: boolean; approvalCount: number;
  riskLevel: "low" | "review" | "high" | null; riskOverridden: boolean; createdAt: string;
};
type Detail = ListItem & {
  customer: { displayName: string; email: string; kycStatus: string; kycApprovedAt: string | null };
  wallet: { topupSen: number; earningsSen: number; pendingEarningsSen: number; reservedSen: number; withdrawnSen: number };
  destinationLabel: string; customerReason: string | null;
  approvals: Array<{ actorId: string; actorLabel: string; action: string; note: string | null; createdAt: string }>;
  reviewSources: {
    rewardSources: ReviewLedgerRow[];
    affiliateSources: ReviewLedgerRow[];
    walletTransactions: ReviewLedgerRow[];
    fraudFlags: unknown[];
  };
  payoutFailure: { provider: string | null; eventId: string | null; code: string | null; message: string | null; category: string | null; occurredAt: string | null; retryable: boolean | null };
};
type ReviewLedgerRow = { id: string; type: string; amountSen: number; direction: string; bucket: string; referenceId: string | null; orderId: string | null; withdrawalId?: string | null; createdAt: string; note: string | null };

const PAGE_SIZES = [15, 25, 50, 100] as const;
const STATUS_OPTIONS = ["pending", "pending_second_approval", "hold", "overdue", "approved", "processing", "paid", "completed", "rejected", "failed"];
const ALL_WALLET_REASON_CATEGORIES = [...new Set(Object.values(WALLET_REASON_RULES).flat())];
// The review drawer is shared by several actions. Show the complete category
// vocabulary, then validate the selected category against the clicked action.
const WALLET_REASON_CATEGORIES = Object.fromEntries(
  Object.keys(WALLET_REASON_RULES).map((key) => [key, ALL_WALLET_REASON_CATEGORIES]),
) as unknown as Record<WalletReasonAction, readonly string[]>;
// Action-style contract: border-2 border-slate-300 for Hold and
// border-2 border-red-300 for Reject. Important variants below win over the
// shared Button outline defaults.
type Action = "approve" | "hold" | "reject" | "resume" | "fraud-override";

function titleCaseStatus(value: string | null | undefined) {
  return (value ?? "Not assessed")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function ReviewLedgerSection({ title, rows }: { title: string; rows: ReviewLedgerRow[] }) {
  return <section className="rounded-xl border border-border p-4 mt-4 text-sm">
    <p className="font-semibold mb-2">{title}</p>
    {rows.length === 0 ? <p className="text-xs text-muted-foreground">No records found.</p> : <div className="space-y-2">
      {rows.map((row) => <div key={row.id} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
        <div className="flex justify-between gap-3"><span>{titleCaseStatus(row.type)} · {titleCaseStatus(row.direction)}</span><span className="font-mono">RM {(row.amountSen / 100).toFixed(2)}</span></div>
        <p className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString("en-MY")}{row.note ? ` · ${row.note}` : ""}</p>
      </div>)}
    </div>}
  </section>;
}

export default function AdminWithdrawalsPage() {
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [items, setItems] = useState<ListItem[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(15);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [reasonCategory, setReasonCategory] = useState("other");
  const [error, setError] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) params.set("status", status);
      if (risk) params.set("risk", risk);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/admin/withdrawals?${params}`);
      const body = await response.json() as { data?: { items: ListItem[]; total: number; totalPages: number }; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Unable to load withdrawal requests");
      setItems(body.data.items); setTotal(body.data.total); setTotalPages(body.data.totalPages);
    } catch (e) {
      showFeedback("error", e instanceof Error ? e.message : "Unable to load withdrawal requests");
    } finally { setLoading(false); }
  }, [page, pageSize, risk, search, showFeedback, status]);

  async function openDetail(id: string) {
    setError("");
    try {
      const response = await fetch(`/api/admin/withdrawals/${id}`);
      const body = await response.json() as { data?: Detail; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Unable to load review details");
      const data = body.data as Detail & { reviewSources?: Detail["reviewSources"]; payoutFailure?: Detail["payoutFailure"] };
      setDetail({
        ...data,
        reviewSources: data.reviewSources ?? { rewardSources: [], affiliateSources: [], walletTransactions: [], fraudFlags: [] },
        payoutFailure: data.payoutFailure ?? { provider: null, eventId: null, code: null, message: null, category: null, occurredAt: null, retryable: null },
      });
      setAction(null); setReason(""); setReasonCategory("other");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load review details"); }
  }

  useEffect(() => { queueMicrotask(() => { void loadList(); }); }, [loadList]);

  async function submitAction(nextAction: Action) {
    if (!detail) return;
    setAction(nextAction); setError("");
    if (nextAction !== "approve" && reason.trim().length < 10) {
      setError("A reason of at least 10 characters is required."); return;
    }
    const walletAction = nextAction === "fraud-override" ? "fraud_override" : nextAction as WalletReasonAction;
    if (!isWalletReasonCategory(walletAction, reasonCategory)) {
      setError("Select a reason category that matches this Wallet action."); return;
    }
    const payload = nextAction === "approve" ? { note: reason.trim(), reasonCategory } : { reason: reason.trim(), reasonCategory };
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/withdrawals/${detail.id}/${nextAction}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Action failed");
      showFeedback("success", nextAction === "fraud-override" ? "Risk override recorded." : "Withdrawal action completed.");
      await openDetail(detail.id); await loadList();
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setLoading(false); }
  }

  const isSuperAdmin = currentUser?.role === "super_admin";
  const canApprove = detail && ["pending", "pending_second_approval"].includes(detail.status);
  const canHoldReject = detail && ["pending", "pending_second_approval", "approved", "hold", "overdue"].includes(detail.status);
  const canResume = detail?.status === "hold";
  const activeReasonAction: WalletReasonAction = action === "fraud-override" ? "fraud_override" : action === "resume" ? "resume" : action === "reject" ? "reject" : action === "approve" ? "approve" : "hold";

  return <div className="p-6 sm:p-8">
    <h1 className="font-bold text-lg text-foreground mb-1">Withdrawal Approvals</h1>
    <p className="text-xs text-muted-foreground mb-5">Review withdrawal requests using wallet balances, risk facts and the approval timeline.</p>
    <div className="rounded-2xl bg-card border border-border p-4 mb-5 flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-[220px]"><Search size={15} className="absolute left-3 top-3 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); void loadList(); } }} placeholder="Search customer or email" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm" /></div>
      <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm"><option value="">All statuses</option>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
      <select value={risk} onChange={(e) => { setRisk(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm"><option value="">All risk levels</option><option value="low">Low</option><option value="review">Review</option><option value="high">High</option></select>
      <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm">{PAGE_SIZES.map((size) => <option key={size} value={size}>{size} per page</option>)}</select>
    </div>
    <div className="rounded-2xl overflow-hidden bg-card border border-border">
      <div className="px-5 py-4 border-b border-border flex justify-between"><h2 className="font-bold text-foreground">Review queue ({total})</h2><span className="text-xs text-muted-foreground">Newest first</span></div>
      {loading && items.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div> : items.length === 0 ? <EmptyState title="No withdrawal requests" /> : <div className="divide-y divide-border">{items.map((item) => <button key={item.id} type="button" onClick={() => void openDetail(item.id)} className="w-full px-5 py-4 text-left flex items-center gap-4 hover:bg-muted/40"><div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold">{item.customerDisplayName.slice(0, 1).toUpperCase()}</div><div className="flex-1 min-w-0"><p className="font-semibold text-sm truncate">{item.customerDisplayName}</p><p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("en-MY")}</p></div><div className="text-right"><p className="font-mono font-bold">RM {(item.amountSen / 100).toFixed(2)}</p><div className="flex items-center gap-2 justify-end"><StatusBadge status={item.status} />{item.riskLevel === "high" && <ShieldAlert size={15} className="text-red-600" />}</div></div></button>)}</div>}
      <div className="px-5 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground"><span>Page {page} of {Math.max(totalPages, 1)}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={14} /></Button><Button size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={14} /></Button></div></div>
    </div>
      {detail && <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={() => setDetail(null)}><aside className="h-full w-full max-w-xl overflow-y-auto bg-card p-6" onClick={(e) => e.stopPropagation()}><div className="flex justify-between items-start"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Withdrawal review</p><h2 className="text-xl font-bold">{detail.customer.displayName}</h2><p className="text-sm text-muted-foreground">{detail.customer.email}</p></div><button type="button" onClick={() => setDetail(null)} aria-label="Close"><X size={20} /></button></div><div className="grid grid-cols-2 gap-3 mt-5 text-sm"><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Amount</p><p className="font-mono font-bold">RM {(detail.amountSen / 100).toFixed(2)}</p></div><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Status</p><StatusBadge status={detail.status} /></div><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">App KYC</p><p>{titleCaseStatus(detail.customer.kycStatus)}</p></div><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Risk</p><p className={detail.riskLevel === "high" ? "text-red-600 font-semibold" : ""}>{titleCaseStatus(detail.riskLevel)}{detail.riskOverridden ? " · Overridden" : ""}</p></div></div><div className="rounded-xl border border-border p-4 mt-4 text-sm"><p className="font-semibold mb-2">Wallet balances</p><p>Top-up: RM {(detail.wallet.topupSen / 100).toFixed(2)}</p><p>Earnings: RM {(detail.wallet.earningsSen / 100).toFixed(2)}</p><p>Pending rewards: RM {(detail.wallet.pendingEarningsSen / 100).toFixed(2)}</p><p>Reserved: RM {(detail.wallet.reservedSen / 100).toFixed(2)}</p><p>Withdrawn: RM {(detail.wallet.withdrawnSen / 100).toFixed(2)}</p><p className="mt-2 text-muted-foreground">Destination: {detail.destinationLabel}</p></div><ReviewLedgerSection title="Reward sources" rows={detail.reviewSources.rewardSources} /><ReviewLedgerSection title="Affiliate sources" rows={detail.reviewSources.affiliateSources} /><ReviewLedgerSection title="Wallet transaction history" rows={detail.reviewSources.walletTransactions} /><section className="rounded-xl border border-border p-4 mt-4 text-sm"><p className="font-semibold mb-2">Fraud flags</p>{detail.reviewSources.fraudFlags.length === 0 ? <p className="text-xs text-muted-foreground">No fraud flags recorded.</p> : <ul className="list-disc pl-5 space-y-1">{detail.reviewSources.fraudFlags.map((flag, index) => <li key={index}>{typeof flag === "string" ? flag : JSON.stringify(flag)}</li>)}</ul>}</section>{(detail.payoutFailure.code || detail.payoutFailure.message || detail.payoutFailure.category) && <section className="rounded-xl border border-red-200 bg-red-50 p-4 mt-4 text-sm"><p className="font-semibold mb-2">Payout failure</p><p>Provider: {detail.payoutFailure.provider ?? "Unknown"}</p><p>Category: {titleCaseStatus(detail.payoutFailure.category)}</p><p>Code: {detail.payoutFailure.code ?? "Not supplied"}</p><p>Reason: {detail.payoutFailure.message ?? "No provider message supplied"}</p><p>Retryable: {detail.payoutFailure.retryable ? "Yes" : "No"}</p></section>}<div className="rounded-xl border border-border p-4 mt-4"><p className="font-semibold mb-2">Approval timeline</p>{detail.approvals.length === 0 ? <p className="text-sm text-muted-foreground">No decisions recorded.</p> : detail.approvals.map((approval) => <div key={`${approval.actorId}-${approval.action}-${approval.createdAt}`} className="py-2 border-b last:border-0 text-sm"><p>{approval.actorLabel} · {titleCaseStatus(approval.action)}</p><p className="text-xs text-muted-foreground">{new Date(approval.createdAt).toLocaleString("en-MY")}{approval.note ? ` · ${approval.note}` : ""}</p></div>)}</div>{detail.customerReason && <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mt-4 text-sm"><p className="font-semibold">Customer-visible reason</p><p>{detail.customerReason}</p></div>}<div className="mt-5"><p className="font-semibold text-sm mb-2">Account action</p>{(canApprove || canHoldReject || canResume || isSuperAdmin) && <select value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value)} className="mb-2 w-full rounded-xl border border-border bg-background p-3 text-sm"><option value="">Select a reason category</option>{WALLET_REASON_CATEGORIES[activeReasonAction].map((category) => <option key={category} value={category}>{titleCaseStatus(category)}</option>)}</select>}<textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === "approve" ? "Enter an approval note of at least 10 characters" : "Enter a reason of at least 10 characters"} maxLength={500} className="w-full min-h-24 rounded-xl border border-border bg-background p-3 text-sm" />{error && <p className="text-sm text-red-600 mt-2">{error}</p>}<div className="flex flex-wrap gap-2 mt-3">{canApprove && <Button onClick={() => void submitAction("approve")} disabled={loading}>Approve</Button>}{canHoldReject && <><Button variant="outline" className="!border-2 !border-slate-300 !bg-white !text-slate-700 hover:!bg-slate-50" style={{ borderWidth: 2, borderStyle: "solid", borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#334155" }} onClick={() => void submitAction("hold")} disabled={loading}>Hold</Button><Button variant="outline" className="!border-2 !border-red-300 !bg-red-50 !text-red-700 hover:!bg-red-100" style={{ borderWidth: 2, borderStyle: "solid", borderColor: "#fca5a5", backgroundColor: "#fef2f2", color: "#b91c1c" }} onClick={() => void submitAction("reject")} disabled={loading}>Reject</Button></>}{canResume && <Button variant="outline" onClick={() => void submitAction("resume")} disabled={loading}>Resume review</Button>}{isSuperAdmin && detail.riskLevel === "high" && !detail.riskOverridden && <Button variant="outline" onClick={() => void submitAction("fraud-override")} disabled={loading}>Override high risk</Button>}</div><p className="text-xs text-muted-foreground mt-2">Reasons are reviewed before they are recorded. Minimum 10 characters.</p></div></aside></div>}
  </div>;
}

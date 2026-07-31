"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Search, ShieldAlert, ShieldCheck, TimerReset, UsersRound, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { isWalletReasonCategory, WALLET_REASON_CATEGORIES as WALLET_REASON_RULES, type WalletReasonAction } from "@/lib/validation/wallet-reason-schemas";

type ListItem = {
  id: string;
  userId: string;
  customerDisplayName: string;
  amountSen: number;
  status: string;
  requiresDualApproval: boolean;
  approvalCount: number;
  riskLevel: "low" | "review" | "high" | null;
  riskOverridden: boolean;
  createdAt: string;
};

type Detail = ListItem & {
  customer: { displayName: string; email: string; kycStatus: string; kycApprovedAt: string | null };
  wallet: { topupSen: number; earningsSen: number; pendingEarningsSen: number; reservedSen: number; withdrawnSen: number };
  destinationLabel: string;
  customerReason: string | null;
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
type Action = "approve" | "hold" | "reject" | "resume" | "fraud-override";
type PendingConfirmation = { action: Action; reasonCategory: string; reason: string };

const PAGE_SIZES = [15, 25, 50, 100] as const;
const STATUS_OPTIONS = [
  { value: "review", label: "Needs review" },
  ...["pending", "pending_second_approval", "hold", "overdue", "approved", "processing", "paid", "completed", "rejected", "failed"].map((value) => ({ value, label: value.replaceAll("_", " ") })),
];
// Action-style contract: border-2 border-slate-300 for Hold and
// border-2 border-red-300 for Reject. Inline styles keep these treatments
// visible over the shared Button outline defaults.

const DECISION_REASON_COPY: Record<WalletReasonAction, Record<string, string>> = {
  hold: {
    insufficient_payout_information: "Payout information is incomplete",
    kyc_or_identity_review: "KYC or identity needs review",
    risk_review_required: "Additional risk review required",
    payout_account_unavailable: "Payout account is unavailable",
    other: "Other reason",
  },
  reject: {
    bank_details_mismatch: "Bank details do not match",
    kyc_or_identity_review: "KYC or identity needs review",
    risk_review_required: "Additional risk review required",
    payout_account_unavailable: "Payout account is unavailable",
    other: "Other reason",
  },
  resume: {
    additional_information_verified: "Additional information verified",
    bank_details_confirmed: "Bank details confirmed",
    kyc_review_completed: "KYC review completed",
    risk_review_cleared: "Risk review cleared",
    other: "Other reason",
  },
  approve: {
    review_completed: "Review completed",
    payout_ready: "Payout details are ready",
    other: "Other reason",
  },
  fraud_override: {
    risk_reviewed: "Risk was reviewed",
    false_positive: "False positive",
    exception_approved: "Exception approved",
    other: "Other reason",
  },
  adjustment: {},
  settings: {},
  approver_role: {},
};

const DECISION_COPY: Record<Action, { label: string; description: string; consequence: string; placeholder: string }> = {
  approve: {
    label: "Approve",
    description: "Confirm the review is complete and start payout processing.",
    consequence: "The withdrawal can move to payout processing.",
    placeholder: "Example: KYC, wallet balance and payout destination were reviewed and verified.",
  },
  hold: {
    label: "Hold",
    description: "Pause the review while requesting more information.",
    consequence: "Keep the reserved funds held until the review continues.",
    placeholder: "Example: Additional identity or payout information is required before processing.",
  },
  reject: {
    label: "Reject",
    description: "Reject the request because it cannot be approved.",
    consequence: "Return the reserved amount to available balance.",
    placeholder: "Example: Bank details could not be verified against the customer account.",
  },
  resume: {
    label: "Resume review",
    description: "Continue a request that was previously placed on hold.",
    consequence: "The request becomes available for the next review step.",
    placeholder: "Example: The requested information has been reviewed and the payout can continue.",
  },
  "fraud-override": {
    label: "Override high risk",
    description: "Record a Super Admin decision after reviewing the risk.",
    consequence: "The high-risk override is recorded for audit.",
    placeholder: "Example: Risk review completed and the alert was confirmed as a false positive.",
  },
};

function titleCaseStatus(value: string | null | undefined) {
  return (value ?? "Not assessed")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function toWalletReasonAction(action: Action): WalletReasonAction {
  return action === "fraud-override" ? "fraud_override" : action;
}

function formatRM(valueSen: number) {
  return `RM ${(valueSen / 100).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAge(createdAt: string | null) {
  if (!createdAt) return "—";
  const hours = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000));
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function getReviewPriority(item: ListItem) {
  if (item.status === "overdue") return { label: "Overdue", className: "border-red-200 bg-red-50 text-red-700", icon: TimerReset };
  if (item.requiresDualApproval && item.approvalCount < 2) return { label: "Waiting for second approver", className: "border-amber-200 bg-amber-50 text-amber-800", icon: UsersRound };
  if (item.riskLevel === "high") return { label: "High risk", className: "border-red-200 bg-red-50 text-red-700", icon: AlertTriangle };
  return { label: "Needs action", className: "border-border bg-muted text-muted-foreground", icon: Clock3 };
}

function ReviewLedgerSection({ title, rows, emptyMessage }: { title: string; rows: ReviewLedgerRow[]; emptyMessage: string }) {
  return <section className="rounded-xl border border-border p-4 mt-4 text-sm">
    <p className="font-semibold mb-2">{title}</p>
    {rows.length === 0 ? <p className="text-xs text-muted-foreground">{emptyMessage}</p> : <div className="space-y-2">
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
  const [status, setStatus] = useState("review");
  const [risk, setRisk] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<Action | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [reason, setReason] = useState("");
  const [reasonCategory, setReasonCategory] = useState("");
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
      setItems(body.data.items);
      setTotal(body.data.total);
      setTotalPages(body.data.totalPages);
    } catch (e) {
      showFeedback("error", e instanceof Error ? e.message : "Unable to load withdrawal requests");
    } finally {
      setLoading(false);
    }
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
      setSelectedDecision(null);
      setPendingConfirmation(null);
      setReason("");
      setReasonCategory("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load review details");
    }
  }

  useEffect(() => { queueMicrotask(() => { void loadList(); }); }, [loadList]);

  function chooseDecision(nextAction: Action) {
    setSelectedDecision(nextAction);
    setPendingConfirmation(null);
    setReason("");
    setReasonCategory("");
    setError("");
  }

  function submitAction() {
    if (!detail || !selectedDecision) return;
    setError("");
    if (!reasonCategory) {
      setError("Choose a reason for this decision.");
      return;
    }
    if (reason.trim().length < 10) {
      setError("A note of at least 10 characters is required.");
      return;
    }
    const walletAction = toWalletReasonAction(selectedDecision);
    if (!isWalletReasonCategory(walletAction, reasonCategory)) {
      setError("Choose a reason that matches this decision.");
      return;
    }
    setPendingConfirmation({ action: selectedDecision, reasonCategory, reason: reason.trim() });
  }

  async function confirmAction() {
    if (!detail || !pendingConfirmation) return;
    const { action: nextAction, reason: pendingReason, reasonCategory: pendingCategory } = pendingConfirmation;
    const payload = nextAction === "approve"
      ? { note: pendingReason, reasonCategory: pendingCategory }
      : { reason: pendingReason, reasonCategory: pendingCategory };
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/withdrawals/${detail.id}/${nextAction}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Action failed");
      showFeedback("success", nextAction === "fraud-override" ? "Risk override recorded." : "Withdrawal action completed.");
      await openDetail(detail.id);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setLoading(false);
    }
  }

  const isSuperAdmin = currentUser?.role === "super_admin";
  const canApprove = detail && ["pending", "pending_second_approval"].includes(detail.status);
  const canHoldReject = detail && ["pending", "pending_second_approval", "approved", "hold", "overdue"].includes(detail.status);
  const canResume = detail?.status === "hold";
  const activeReasonAction = selectedDecision ? toWalletReasonAction(selectedDecision) : null;
  const hasReviewEvidence = detail ? detail.reviewSources.rewardSources.length > 0
    || detail.reviewSources.affiliateSources.length > 0
    || detail.reviewSources.walletTransactions.length > 0
    || detail.reviewSources.fraudFlags.length > 0 : true;
  const canChooseDecision = Boolean(canApprove || canHoldReject || canResume || isSuperAdmin);
  const availableDecisions: Action[] = [
    ...(canApprove ? ["approve" as const] : []),
    ...(canHoldReject ? ["hold" as const, "reject" as const] : []),
    ...(canResume ? ["resume" as const] : []),
    ...(isSuperAdmin && detail?.riskLevel === "high" && !detail.riskOverridden ? ["fraud-override" as const] : []),
  ];
  const visiblePayoutValue = items.reduce((sum, item) => sum + item.amountSen, 0);
  const visibleHighRisk = items.filter((item) => item.riskLevel === "high").length;
  const visibleDualApproval = items.filter((item) => item.requiresDualApproval && item.approvalCount < 2).length;
  const visibleOverdue = items.filter((item) => item.status === "overdue").length;
  const oldestRequest = items.reduce<ListItem | null>((oldest, item) => !oldest || new Date(item.createdAt).getTime() < new Date(oldest.createdAt).getTime() ? item : oldest, null);

  return <div className="min-h-full p-6 sm:p-8 xl:p-10">
    <div className="mx-auto max-w-[1500px]">
    <div className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-primary"><ShieldCheck size={14} /> Wallet governance</p><h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground">Withdrawal Approvals</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review payout requests with the amount, risk, approval progress and age visible before opening the evidence drawer.</p></div><div className="rounded-xl border border-border bg-card px-4 py-3 text-right shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Review priority</p><p className="mt-1 text-sm font-semibold text-foreground">{total > 0 ? "Oldest first" : "Queue clear"}</p></div></div>
    <div aria-label="Withdrawal review summary" className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
      {[{ label: "Needs action", value: total, detail: "Requests in this queue" }, { label: "Pending payout value", value: formatRM(visiblePayoutValue), detail: "Visible page total" }, { label: "High risk", value: visibleHighRisk, detail: "Visible page total" }, { label: "Dual approval", value: visibleDualApproval, detail: "Waiting for second approver" }, { label: "Overdue", value: visibleOverdue, detail: oldestRequest ? `Oldest request ${formatAge(oldestRequest.createdAt)}` : "No overdue requests" }].map((metric) => <div key={metric.label} className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_10px_rgba(1,0,102,0.06)]"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p><p className="mt-2 font-[family-name:var(--font-mono)] text-xl font-bold text-foreground">{metric.value}</p><p className="mt-1 text-[11px] text-muted-foreground">{metric.detail}</p></div>)}
    </div>
    <div className="rounded-2xl bg-card border border-border p-4 mb-5 flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-[220px]"><Search size={15} className="absolute left-3 top-3 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); void loadList(); } }} placeholder="Search customer or email" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm" /></div>
      <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm"><option value="">All statuses</option>{STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <select value={risk} onChange={(e) => { setRisk(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm"><option value="">All risk levels</option><option value="low">Low</option><option value="review">Review</option><option value="high">High</option></select>
      <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm">{PAGE_SIZES.map((size) => <option key={size} value={size}>{size} per page</option>)}</select>
    </div>
    <div className="rounded-2xl overflow-hidden bg-card border border-border shadow-[0_1px_10px_rgba(1,0,102,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="font-bold text-foreground">Review queue ({total})</h2><p className="mt-1 text-xs text-muted-foreground">Open a row when the review priority or evidence needs a closer look.</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{oldestRequest ? `Oldest request ${formatAge(oldestRequest.createdAt)}` : "No open requests"}</span></div>
      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[minmax(210px,1.35fr)_120px_145px_150px_120px_145px_32px] items-center gap-4 border-b border-border bg-muted/30 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"><span>Customer</span><span>Amount</span><span>Risk / priority</span><span>Approval progress</span><span>Age / SLA</span><span>Status</span><span aria-hidden="true" /></div>
          {loading && items.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div> : items.length === 0 ? <EmptyState title="No withdrawal requests" /> : <div className="divide-y divide-border">{items.map((item) => { const priority = getReviewPriority(item); const PriorityIcon = priority.icon; return <button key={item.id} type="button" onClick={() => void openDetail(item.id)} aria-label={`${item.customerDisplayName}, ${formatRM(item.amountSen)}, ${priority.label}`} className="group grid w-full grid-cols-[minmax(210px,1.35fr)_120px_145px_150px_120px_145px_32px] items-center gap-4 px-5 py-4 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{item.customerDisplayName.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{item.customerDisplayName}</p><p className="mt-1 truncate text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("en-MY")} · {item.userId.slice(0, 8)}…</p></div></div><div><p className="font-[family-name:var(--font-mono)] text-sm font-bold text-foreground">{formatRM(item.amountSen)}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.requiresDualApproval ? "RM500+ threshold" : "Standard review"}</p></div><div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${priority.className}`}><PriorityIcon size={12} />{priority.label}</span>{item.riskLevel && <p className="mt-1 text-[11px] text-muted-foreground">Risk: {item.riskLevel}</p>}</div><div><p className="text-sm font-semibold text-foreground">{item.requiresDualApproval ? `${Math.min(item.approvalCount, 2)}/2 approvals` : "1/1 approval"}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.requiresDualApproval && item.approvalCount < 2 ? "Waiting for second approver" : "Approval path ready"}</p></div><div><p className={`text-sm font-semibold ${item.status === "overdue" ? "text-red-700" : "text-foreground"}`}>{formatAge(item.createdAt)}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.status === "overdue" ? "Overdue" : "Within review window"}</p></div><div className="flex items-center gap-2"><StatusBadge status={item.status} />{item.riskLevel === "high" && <ShieldAlert size={15} aria-label="High risk" className="text-red-600" />}</div><ArrowUpRight size={16} className="text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></button>; })}</div>}
        </div>
      </div>
      <div className="px-5 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground"><span>Page {page} of {Math.max(totalPages, 1)}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={14} /></Button><Button size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={14} /></Button></div></div>
    </div>
    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={`${detail.customer.displayName} withdrawal review`} onClick={() => setDetail(null)}><aside className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:max-h-[calc(100vh-3rem)] sm:p-6" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-start"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Withdrawal review</p><h2 className="text-xl font-bold">{detail.customer.displayName}</h2><p className="text-sm text-muted-foreground">{detail.customer.email}</p></div><button type="button" onClick={() => setDetail(null)} aria-label="Close"><X size={20} /></button></div>
      <div className="grid grid-cols-2 gap-3 mt-5 text-sm"><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Amount</p><p className="font-mono font-bold">{formatRM(detail.amountSen)}</p></div><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Status</p><StatusBadge status={detail.status} /></div><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">App KYC</p><p>{titleCaseStatus(detail.customer.kycStatus)}</p></div><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Risk</p><p className={detail.riskLevel === "high" ? "text-red-600 font-semibold" : ""}>{titleCaseStatus(detail.riskLevel)}{detail.riskOverridden ? " · Overridden" : ""}</p></div></div>
      <section className="mt-4 rounded-xl border border-border bg-muted/20 p-4"><div className="flex items-center justify-between"><p className="font-semibold text-sm">Decision readiness</p><span className="text-[11px] font-semibold text-muted-foreground">Review priority: {getReviewPriority(detail).label}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{[
        { label: "App KYC", value: titleCaseStatus(detail.customer.kycStatus), ready: detail.customer.kycStatus === "approved" },
        { label: "Wallet evidence", value: hasReviewEvidence ? "Available" : "Unavailable", ready: hasReviewEvidence },
        { label: "Payout destination", value: detail.destinationLabel || "Not supplied", ready: Boolean(detail.destinationLabel) },
        { label: "Approval progress", value: detail.requiresDualApproval ? `${Math.min(detail.approvalCount, 2)}/2 approvals` : "Single approval", ready: !detail.requiresDualApproval || detail.approvalCount >= 2 },
      ].map((check) => <div key={check.label} className="flex items-start gap-2 rounded-lg bg-card px-3 py-2.5"><span className={check.ready ? "text-emerald-600" : "text-amber-600"}>{check.ready ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span><div><p className="text-xs font-semibold text-foreground">{check.label}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{check.value}</p></div></div>)}</div></section>
      <div className="rounded-xl border border-border p-4 mt-4 text-sm"><p className="font-semibold mb-2">Wallet balances</p><p>Top-up: RM {(detail.wallet.topupSen / 100).toFixed(2)}</p><p>Earnings: RM {(detail.wallet.earningsSen / 100).toFixed(2)}</p><p>Pending rewards: RM {(detail.wallet.pendingEarningsSen / 100).toFixed(2)}</p><p>Reserved: RM {(detail.wallet.reservedSen / 100).toFixed(2)}</p><p>Withdrawn: RM {(detail.wallet.withdrawnSen / 100).toFixed(2)}</p><p className="mt-2 text-muted-foreground">Destination: {detail.destinationLabel}</p></div>
      {!hasReviewEvidence && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 mt-4 text-sm text-amber-950"><p className="font-semibold">Review data is currently unavailable</p><p>Do not approve until the data is available.</p></div>}
      <ReviewLedgerSection title="Reward sources" rows={detail.reviewSources.rewardSources} emptyMessage="No reward transactions were found." />
      <ReviewLedgerSection title="Affiliate sources" rows={detail.reviewSources.affiliateSources} emptyMessage="No affiliate transactions were found." />
      <ReviewLedgerSection title="Wallet transaction history" rows={detail.reviewSources.walletTransactions} emptyMessage="No wallet transactions were found." />
      <section className="rounded-xl border border-border p-4 mt-4 text-sm"><p className="font-semibold mb-2">Fraud flags</p>{detail.reviewSources.fraudFlags.length === 0 ? <p className="text-xs text-muted-foreground">{hasReviewEvidence ? "No fraud flags recorded." : "Fraud review data is currently unavailable."}</p> : <ul className="list-disc pl-5 space-y-1">{detail.reviewSources.fraudFlags.map((flag, index) => <li key={index}>{typeof flag === "string" ? flag : JSON.stringify(flag)}</li>)}</ul>}</section>
      {(detail.payoutFailure.code || detail.payoutFailure.message || detail.payoutFailure.category) && <section className="rounded-xl border border-red-200 bg-red-50 p-4 mt-4 text-sm"><p className="font-semibold mb-2">Payout failure</p><p>Provider: {detail.payoutFailure.provider ?? "Unknown"}</p><p>Category: {titleCaseStatus(detail.payoutFailure.category)}</p><p>Code: {detail.payoutFailure.code ?? "Not supplied"}</p><p>Reason: {detail.payoutFailure.message ?? "No provider message supplied"}</p><p>Retryable: {detail.payoutFailure.retryable ? "Yes" : "No"}</p></section>}
      <div className="rounded-xl border border-border p-4 mt-4"><p className="font-semibold mb-2">Approval timeline</p>{detail.approvals.length === 0 ? <p className="text-sm text-muted-foreground">No decisions recorded yet.</p> : detail.approvals.map((approval) => <div key={`${approval.actorId}-${approval.action}-${approval.createdAt}`} className="py-2 border-b last:border-0 text-sm"><p>{approval.actorLabel} · {titleCaseStatus(approval.action)}</p><p className="text-xs text-muted-foreground">{new Date(approval.createdAt).toLocaleString("en-MY")}{approval.note ? ` · ${approval.note}` : ""}</p></div>)}</div>
      {detail.customerReason && <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mt-4 text-sm"><p className="font-semibold">Customer-visible reason</p><p>{detail.customerReason}</p></div>}

      {canChooseDecision && <div className="mt-5 rounded-xl border border-border p-4"><p className="font-semibold text-sm mb-1">Decision</p><p className="text-xs text-muted-foreground mb-3">Choose what should happen to this withdrawal request.</p><div role="group" aria-label="Withdrawal decision" className="grid gap-3 sm:grid-cols-2">
        {availableDecisions.map((decision) => <div key={decision} className="rounded-lg border border-border p-3"><Button variant={decision === "approve" ? "default" : "outline"} className={decision === "hold" ? "!border-2 !border-slate-300 !bg-white !text-slate-700 hover:!bg-slate-50" : decision === "reject" ? "!border-2 !border-red-300 !bg-red-50 !text-red-700 hover:!bg-red-100" : ""} style={decision === "hold" ? { borderWidth: 2, borderStyle: "solid", borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#334155" } : decision === "reject" ? { borderWidth: 2, borderStyle: "solid", borderColor: "#fca5a5", backgroundColor: "#fef2f2", color: "#b91c1c" } : undefined} onClick={() => chooseDecision(decision)} aria-pressed={selectedDecision === decision}>{DECISION_COPY[decision].label}</Button><p className="text-xs text-muted-foreground mt-2">{DECISION_COPY[decision].description}</p><p className="text-xs font-medium mt-1">After this: {DECISION_COPY[decision].consequence}</p></div>)}
      </div>

      {selectedDecision ? <div className="mt-4 border-t border-border pt-4"><div className="rounded-lg bg-muted/40 p-3 mb-3 text-sm"><p className="font-semibold">{DECISION_COPY[selectedDecision].label}</p><p className="text-muted-foreground">{DECISION_COPY[selectedDecision].description}</p><p className="mt-1 text-xs text-muted-foreground">{DECISION_COPY[selectedDecision].consequence}</p></div>{activeReasonAction && <label className="block text-sm"><span className="block font-medium mb-1">Reason for this decision</span><select value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value)} className="w-full rounded-xl border border-border bg-background p-3 text-sm"><option value="">Select a reason</option>{WALLET_REASON_RULES[activeReasonAction].map((category) => <option key={category} value={category}>{DECISION_REASON_COPY[activeReasonAction][category] ?? titleCaseStatus(category)}</option>)}</select></label>}<label className="block text-sm mt-3"><span className="block font-medium mb-1">Admin note</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={DECISION_COPY[selectedDecision].placeholder} maxLength={500} className="w-full min-h-24 rounded-xl border border-border bg-background p-3 text-sm" /><span className="text-xs text-muted-foreground">Minimum 10 characters.</span></label>{error && <p className="text-sm text-red-600 mt-2">{error}</p>}<Button className="mt-3" onClick={submitAction} disabled={loading || !reasonCategory || reason.trim().length < 10}>Continue to confirmation</Button></div> : <p className="mt-4 text-xs text-muted-foreground">Select a decision to see the required reason and note.</p>}

      {pendingConfirmation && <div role="dialog" aria-modal="true" aria-labelledby="confirm-withdrawal-title" className="mt-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-sm"><h3 id="confirm-withdrawal-title" className="font-semibold">Confirm withdrawal decision</h3><p className="mt-2">Customer: {detail.customer.displayName}</p><p>Amount: RM {(detail.amountSen / 100).toFixed(2)}</p><p>Destination: {detail.destinationLabel}</p><p>Decision: {DECISION_COPY[pendingConfirmation.action].label}</p><p>Reason: {DECISION_REASON_COPY[toWalletReasonAction(pendingConfirmation.action)][pendingConfirmation.reasonCategory] ?? titleCaseStatus(pendingConfirmation.reasonCategory)}</p><p>Note: {pendingConfirmation.reason}</p><div className="flex flex-wrap gap-2 mt-4"><Button onClick={() => void confirmAction()} disabled={loading}>Confirm decision</Button><Button variant="outline" onClick={() => setPendingConfirmation(null)} disabled={loading}>Cancel</Button></div></div>}
      <p className="text-xs text-muted-foreground mt-3">Every decision is recorded in the audit timeline.</p></div>}
    </aside></div>}
    </div>
  </div>;
}

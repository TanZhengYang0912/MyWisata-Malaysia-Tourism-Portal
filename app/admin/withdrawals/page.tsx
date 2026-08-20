"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Search, ShieldAlert, ShieldCheck, TimerReset, UsersRound, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { AdminBatchActionBar } from "@/components/admin/batch-action-bar";
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
  { value: "review", labelKey: "withdrawals.status.needsReview" },
  ...["pending", "pending_second_approval", "hold", "overdue", "approved", "processing", "paid", "completed", "rejected", "failed"].map((value) => ({ value, labelKey: `withdrawals.status.${value}` })),
];
// Action-style contract: border-2 border-slate-300 for Hold and
// border-2 border-red-300 for Reject. Inline styles keep these treatments
// visible over the shared Button outline defaults.

const DECISION_REASON_COPY: Record<WalletReasonAction, Record<string, string>> = {
  hold: {
    insufficient_payout_information: "withdrawals.reasons.insufficientPayoutInformation",
    kyc_or_identity_review: "withdrawals.reasons.kycOrIdentityReview",
    risk_review_required: "withdrawals.reasons.riskReviewRequired",
    payout_account_unavailable: "withdrawals.reasons.payoutAccountUnavailable",
    other: "withdrawals.reasons.other",
  },
  reject: {
    bank_details_mismatch: "withdrawals.reasons.bankDetailsMismatch",
    kyc_or_identity_review: "withdrawals.reasons.kycOrIdentityReview",
    risk_review_required: "withdrawals.reasons.riskReviewRequired",
    payout_account_unavailable: "withdrawals.reasons.payoutAccountUnavailable",
    other: "withdrawals.reasons.other",
  },
  resume: {
    additional_information_verified: "withdrawals.reasons.additionalInformationVerified",
    bank_details_confirmed: "withdrawals.reasons.bankDetailsConfirmed",
    kyc_review_completed: "withdrawals.reasons.kycReviewCompleted",
    risk_review_cleared: "withdrawals.reasons.riskReviewCleared",
    other: "withdrawals.reasons.other",
  },
  approve: {
    review_completed: "withdrawals.reasons.reviewCompleted",
    payout_ready: "withdrawals.reasons.payoutReady",
    other: "withdrawals.reasons.other",
  },
  fraud_override: {
    risk_reviewed: "withdrawals.reasons.riskReviewed",
    false_positive: "withdrawals.reasons.falsePositive",
    exception_approved: "withdrawals.reasons.exceptionApproved",
    other: "withdrawals.reasons.other",
  },
  adjustment: {},
  settings: {},
  approver_role: {},
};

const DECISION_COPY: Record<Action, { labelKey: string; descriptionKey: string; consequenceKey: string; placeholderKey: string }> = {
  approve: {
    labelKey: "withdrawals.decisions.approve.label",
    descriptionKey: "withdrawals.decisions.approve.description",
    consequenceKey: "withdrawals.decisions.approve.consequence",
    placeholderKey: "withdrawals.decisions.approve.placeholder",
  },
  hold: {
    labelKey: "withdrawals.decisions.hold.label",
    descriptionKey: "withdrawals.decisions.hold.description",
    consequenceKey: "withdrawals.decisions.hold.consequence",
    placeholderKey: "withdrawals.decisions.hold.placeholder",
  },
  reject: {
    labelKey: "withdrawals.decisions.reject.label",
    descriptionKey: "withdrawals.decisions.reject.description",
    consequenceKey: "withdrawals.decisions.reject.consequence",
    placeholderKey: "withdrawals.decisions.reject.placeholder",
  },
  resume: {
    labelKey: "withdrawals.decisions.resume.label",
    descriptionKey: "withdrawals.decisions.resume.description",
    consequenceKey: "withdrawals.decisions.resume.consequence",
    placeholderKey: "withdrawals.decisions.resume.placeholder",
  },
  "fraud-override": {
    labelKey: "withdrawals.decisions.fraudOverride.label",
    descriptionKey: "withdrawals.decisions.fraudOverride.description",
    consequenceKey: "withdrawals.decisions.fraudOverride.consequence",
    placeholderKey: "withdrawals.decisions.fraudOverride.placeholder",
  },
};

const ENUM_VALUE_KEYS: Record<string, string> = {
  account_disabled: "withdrawals.enumValues.accountDisabled",
  adjustment: "withdrawals.enumValues.adjustment",
  affiliate_commission: "withdrawals.enumValues.affiliateCommission",
  approve: "withdrawals.decisions.approve.label",
  approved: "withdrawals.status.approved",
  completed: "withdrawals.status.completed",
  credit: "withdrawals.enumValues.credit",
  debit: "withdrawals.enumValues.debit",
  earnings: "withdrawals.enumValues.earnings",
  earnings_confirm: "withdrawals.enumValues.earningsConfirm",
  earnings_pending: "withdrawals.enumValues.earningsPending",
  earnings_reverse: "withdrawals.enumValues.earningsReverse",
  failed: "withdrawals.status.failed",
  fraud_override: "withdrawals.decisions.fraudOverride.label",
  high: "withdrawals.risk.high",
  hold: "withdrawals.decisions.hold.label",
  invalid_destination: "withdrawals.enumValues.invalidDestination",
  kyc_verified: "withdrawals.enumValues.kycVerified",
  low: "withdrawals.risk.low",
  paid: "withdrawals.status.paid",
  pending: "withdrawals.status.pending",
  pending_earnings: "withdrawals.enumValues.pendingEarnings",
  pending_second_approval: "withdrawals.status.pending_second_approval",
  processing: "withdrawals.status.processing",
  provider_error: "withdrawals.enumValues.providerError",
  refund_credit: "withdrawals.enumValues.refundCredit",
  reject: "withdrawals.decisions.reject.label",
  rejected: "withdrawals.status.rejected",
  resume: "withdrawals.decisions.resume.label",
  review: "withdrawals.risk.review",
  reward_cleared: "withdrawals.enumValues.rewardCleared",
  reward_pending: "withdrawals.enumValues.rewardPending",
  spend: "withdrawals.enumValues.spend",
  topup: "withdrawals.enumValues.topUp",
  unverified: "withdrawals.enumValues.unverified",
  withdrawal_cancel: "withdrawals.enumValues.withdrawalCancel",
  withdrawal_complete: "withdrawals.enumValues.withdrawalComplete",
  withdrawal_release: "withdrawals.enumValues.withdrawalRelease",
  withdrawal_reserve: "withdrawals.enumValues.withdrawalReserve",
};

function toWalletReasonAction(action: Action): WalletReasonAction {
  return action === "fraud-override" ? "fraud_override" : action;
}

function getReviewPriority(item: ListItem) {
  if (item.status === "overdue") return { labelKey: "withdrawals.priority.overdue", className: "border-red-200 bg-red-50 text-red-700", icon: TimerReset };
  if (item.requiresDualApproval && item.approvalCount < 2) return { labelKey: "withdrawals.priority.waitingForSecondApprover", className: "border-amber-200 bg-amber-50 text-amber-800", icon: UsersRound };
  if (item.riskLevel === "high") return { labelKey: "withdrawals.priority.highRisk", className: "border-red-200 bg-red-50 text-red-700", icon: AlertTriangle };
  return { labelKey: "withdrawals.priority.needsAction", className: "border-border bg-muted text-muted-foreground", icon: Clock3 };
}

function ReviewLedgerSection({ title, rows, emptyMessage, locale, displayEnum, formatAmount }: { title: string; rows: ReviewLedgerRow[]; emptyMessage: string; locale: AppLocale; displayEnum: (value: string | null | undefined) => string; formatAmount: (valueSen: number) => string }) {
  return <section className="rounded-xl border border-border p-4 mt-4 text-sm">
    <p className="font-semibold mb-2">{title}</p>
    {rows.length === 0 ? <p className="text-xs text-muted-foreground">{emptyMessage}</p> : <div className="space-y-2">
      {rows.map((row) => <div key={row.id} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
        <div className="flex justify-between gap-3"><span>{displayEnum(row.type)} · {displayEnum(row.direction)}</span><span className="font-mono">{formatAmount(row.amountSen)}</span></div>
        <p className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString(locale)}{row.note ? ` · ${row.note}` : ""}</p>
      </div>)}
    </div>}
  </section>;
}

export default function AdminWithdrawalsPage() {
  const { t, i18n } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonCategory, setReasonCategory] = useState("");
  const [error, setError] = useState("");
  const [referenceNow, setReferenceNow] = useState<number | null>(null);

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
      setReferenceNow(new Date().getTime());
    } catch (e) {
      showFeedback("error", e instanceof Error ? e.message : t("withdrawals.errors.loadRequests"));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, risk, search, showFeedback, status, t]);

  async function openDetail(id: string) {
    setError("");
    try {
      const response = await fetch(`/api/admin/withdrawals/${id}`);
      const body = await response.json() as { data?: Detail; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t("withdrawals.errors.loadReviewDetails"));
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
      const message = e instanceof Error ? e.message : t("withdrawals.errors.loadReviewDetails");
      showFeedback("error", `${message}. ${t("withdrawals.feedback.refreshAndContactSuperAdmin")}`);
      setError(message);
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
      setError(t("withdrawals.errors.chooseDecisionReason"));
      return;
    }
    if (reason.trim().length < 10) {
      setError(t("withdrawals.errors.minimumNote"));
      return;
    }
    const walletAction = toWalletReasonAction(selectedDecision);
    if (!isWalletReasonCategory(walletAction, reasonCategory)) {
      setError(t("withdrawals.errors.matchDecisionReason"));
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
      if (!response.ok) throw new Error(body.error?.message ?? t("withdrawals.errors.actionFailed"));
      showFeedback("success", nextAction === "fraud-override" ? t("withdrawals.feedback.riskOverrideRecorded") : t("withdrawals.feedback.actionCompleted"));
      await openDetail(detail.id);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("withdrawals.errors.actionFailed"));
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
  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const batchActions = selectedItems.length === 0 ? [] : (['approve', 'hold', 'reject', 'resume', 'fraud-override'] as Action[]).filter((action) => selectedItems.every((item) => {
    const approve = action === 'approve' && ['pending', 'pending_second_approval'].includes(item.status);
    const holdReject = ['hold', 'reject'].includes(action) && ['pending', 'pending_second_approval', 'approved', 'hold', 'overdue'].includes(item.status);
    const resume = action === 'resume' && item.status === 'hold';
    const fraudOverride = action === 'fraud-override' && isSuperAdmin && item.riskLevel === 'high' && !item.riskOverridden;
    return approve || holdReject || resume || fraudOverride;
  }));
  const visiblePayoutValue = items.reduce((sum, item) => sum + item.amountSen, 0);
  const visibleHighRisk = items.filter((item) => item.riskLevel === "high").length;
  const visibleDualApproval = items.filter((item) => item.requiresDualApproval && item.approvalCount < 2).length;
  const visibleOverdue = items.filter((item) => item.status === "overdue").length;
  const oldestRequest = items.reduce<ListItem | null>((oldest, item) => !oldest || new Date(item.createdAt).getTime() < new Date(oldest.createdAt).getTime() ? item : oldest, null);
  const displayStatus = (value: string | null | undefined) => value
    ? t(ENUM_VALUE_KEYS[value] ?? "withdrawals.status.unknown")
    : t("withdrawals.status.notAssessed");
  const formatRM = (valueSen: number) => `RM ${(valueSen / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatAge = (createdAt: string | null) => {
    if (!createdAt) return "—";
    const createdAtTime = new Date(createdAt).getTime();
    const hours = Math.max(0, Math.floor(((referenceNow ?? createdAtTime) - createdAtTime) / 3_600_000));
    if (hours < 1) return t("withdrawals.age.lessThanHour");
    if (hours < 24) return t("withdrawals.age.hours", { count: hours });
    return t("withdrawals.age.daysHours", { days: Math.floor(hours / 24), hours: hours % 24 });
  };
  const decisionLabel = (action: Action) => t(DECISION_COPY[action].labelKey);
  const decisionReason = (action: WalletReasonAction, category: string) => {
    const key = DECISION_REASON_COPY[action][category];
    return key ? t(key) : displayStatus(category);
  };

  async function applyBatch(action: Action) {
    if (batchBusy || !selectedItems.length || !batchActions.includes(action)) return;
    const reasonAction = toWalletReasonAction(action);
    const allowedReasons: readonly string[] = WALLET_REASON_RULES[reasonAction];
    const reasonOptions = allowedReasons.map((category) => `${category}: ${decisionReason(reasonAction, category)}`).join(", ");
    const reasonCategory = window.prompt(t("withdrawals.prompts.reasonCategory", { reasons: reasonOptions }), allowedReasons[0])?.trim();
    if (!reasonCategory || !allowedReasons.includes(reasonCategory)) {
      setError(t("withdrawals.errors.invalidReasonCategory"));
      return;
    }
    const note = window.prompt(t("withdrawals.prompts.adminNote"))?.trim();
    if (!note || note.length < 10) {
      setError(t("withdrawals.errors.minimumNote"));
      return;
    }
    if (!window.confirm(t("withdrawals.prompts.batchConfirm", {
      action: decisionLabel(action),
      count: selectedItems.length,
      itemLabel: t(selectedItems.length === 1 ? "withdrawals.selection.withdrawal" : "withdrawals.selection.withdrawals"),
    }))) return;
    setBatchBusy(true);
    setError('');
    try {
      const responses = await Promise.all(selectedItems.map((item) => fetch(`/api/admin/withdrawals/${item.id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'approve' ? { note, reasonCategory } : { reason: note, reasonCategory }),
      })));
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body.error?.message ?? t("withdrawals.errors.batchActionFailed"));
      }
      setSelectedIds(new Set());
      showFeedback("success", t("withdrawals.feedback.batchProcessed", { count: selectedItems.length }));
      await loadList();
    } catch (error) {
      setError(error instanceof Error ? error.message : t("withdrawals.errors.batchActionFailed"));
    } finally {
      setBatchBusy(false);
    }
  }

  return <div className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
    <div className="w-full space-y-6">
    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-primary"><ShieldCheck size={14} /> {t("withdrawals.header.eyebrow")}</p><h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl">{t("withdrawals.header.title")}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("withdrawals.header.description")}</p></div><div className="rounded-xl border border-border bg-card px-4 py-3 text-right shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("withdrawals.header.reviewPriority")}</p><p className="mt-1 text-sm font-semibold text-foreground">{total > 0 ? t("withdrawals.header.oldestFirst") : t("withdrawals.header.queueClear")}</p></div></div>
    <div aria-label={t("withdrawals.accessibility.reviewSummary")} className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      {[{ label: t("withdrawals.metrics.needsAction"), value: total, detail: t("withdrawals.metrics.requestsInQueue") }, { label: t("withdrawals.metrics.pendingPayoutValue"), value: formatRM(visiblePayoutValue), detail: t("withdrawals.metrics.visiblePageTotal") }, { label: t("withdrawals.metrics.highRisk"), value: visibleHighRisk, detail: t("withdrawals.metrics.visiblePageTotal") }, { label: t("withdrawals.metrics.dualApproval"), value: visibleDualApproval, detail: t("withdrawals.metrics.waitingForSecondApprover") }, { label: t("withdrawals.metrics.overdue"), value: visibleOverdue, detail: oldestRequest ? t("withdrawals.metrics.oldestRequest", { age: formatAge(oldestRequest.createdAt) }) : t("withdrawals.metrics.noOverdueRequests") }].map((metric) => <div key={metric.label} className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_10px_rgba(1,0,102,0.06)]"><p className="text-sm font-semibold text-muted-foreground">{metric.label}</p><p className="mt-4 text-3xl font-bold tracking-[-0.05em] text-foreground">{metric.value}</p><p className="mt-1 text-xs font-medium text-muted-foreground">{metric.detail}</p></div>)}
    </div>
    <div className="rounded-2xl bg-card border border-border p-4 flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-[220px]"><Search size={15} className="absolute left-3 top-3 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); void loadList(); } }} placeholder={t("withdrawals.filters.searchCustomerOrEmail")} className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm" /></div>
      <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm"><option value="">{t("withdrawals.filters.allStatuses")}</option>{STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}</select>
      <select value={risk} onChange={(e) => { setRisk(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm"><option value="">{t("withdrawals.filters.allRiskLevels")}</option><option value="low">{t("withdrawals.risk.low")}</option><option value="review">{t("withdrawals.risk.review")}</option><option value="high">{t("withdrawals.risk.high")}</option></select>
      <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm">{PAGE_SIZES.map((size) => <option key={size} value={size}>{t("withdrawals.filters.perPage", { count: size })}</option>)}</select>
    </div>
    <div className="rounded-2xl overflow-hidden bg-card border border-border shadow-[0_1px_10px_rgba(1,0,102,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="font-bold text-foreground">{t("withdrawals.queue.title", { count: total })}</h2><p className="mt-1 text-xs text-muted-foreground">{t("withdrawals.queue.description")}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{oldestRequest ? t("withdrawals.queue.oldestRequest", { age: formatAge(oldestRequest.createdAt) }) : t("withdrawals.queue.noOpenRequests")}</span></div>
      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <AdminBatchActionBar selectedCount={selectedItems.length} onClear={() => setSelectedIds(new Set())} onApply={(action) => void applyBatch(action as Action)} actions={batchActions.map((action) => ({ value: action, label: decisionLabel(action) }))} busy={batchBusy} message={selectedItems.length > 0 && batchActions.length === 0 ? t("withdrawals.batch.noCommonAction") : undefined} />
          <div className="grid grid-cols-[36px_minmax(210px,1.35fr)_120px_145px_150px_120px_145px_32px] items-center gap-4 border-b border-border bg-muted/30 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"><span /><span>{t("withdrawals.table.customer")}</span><span>{t("withdrawals.table.amount")}</span><span>{t("withdrawals.table.riskPriority")}</span><span>{t("withdrawals.table.approvalProgress")}</span><span>{t("withdrawals.table.ageSla")}</span><span>{t("withdrawals.table.status")}</span><span aria-hidden="true" /></div>
          {loading && items.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">{t("withdrawals.loading")}</div> : items.length === 0 ? <EmptyState title={t("withdrawals.empty.noRequests")} /> : <div className="divide-y divide-border">{items.map((item) => { const priority = getReviewPriority(item); const PriorityIcon = priority.icon; return <button key={item.id} type="button" onClick={() => void openDetail(item.id)} aria-label={t("withdrawals.accessibility.openRow", { customer: item.customerDisplayName, amount: formatRM(item.amountSen), priority: t(priority.labelKey) })} className="group grid w-full grid-cols-[36px_minmax(210px,1.35fr)_120px_145px_150px_120px_145px_32px] items-center gap-4 px-5 py-4 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><input type="checkbox" aria-label={t("withdrawals.accessibility.selectRow", { customer: item.customerDisplayName })} checked={selectedIds.has(item.id)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); event.target.checked ? next.add(item.id) : next.delete(item.id); return next; })} /><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{item.customerDisplayName.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{item.customerDisplayName}</p><p className="mt-1 truncate text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString(locale)} · {item.userId.slice(0, 8)}…</p></div></div><div><p className="font-[family-name:var(--font-mono)] text-sm font-bold text-foreground">{formatRM(item.amountSen)}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.requiresDualApproval ? t("withdrawals.table.rm500Threshold") : t("withdrawals.table.standardReview")}</p></div><div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${priority.className}`}><PriorityIcon size={12} />{t(priority.labelKey)}</span>{item.riskLevel && <p className="mt-1 text-[11px] text-muted-foreground">{t("withdrawals.table.risk", { level: displayStatus(item.riskLevel) })}</p>}</div><div><p className="text-sm font-semibold text-foreground">{item.requiresDualApproval ? t("withdrawals.table.dualApprovals", { count: Math.min(item.approvalCount, 2) }) : t("withdrawals.table.singleApproval")}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.requiresDualApproval && item.approvalCount < 2 ? t("withdrawals.table.waitingForSecondApprover") : t("withdrawals.table.approvalPathReady")}</p></div><div><p className={`text-sm font-semibold ${item.status === "overdue" ? "text-red-700" : "text-foreground"}`}>{formatAge(item.createdAt)}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.status === "overdue" ? t("withdrawals.table.overdue") : t("withdrawals.table.withinReviewWindow")}</p></div><div className="flex items-center gap-2"><StatusBadge status={item.status} />{item.riskLevel === "high" && <ShieldAlert size={15} aria-label={t("withdrawals.accessibility.highRisk")} className="text-red-600" />}</div><ArrowUpRight size={16} className="text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></button>; })}</div>}
        </div>
      </div>
      <div className="px-5 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground"><span>{t("withdrawals.pagination.pageOf", { page, totalPages: Math.max(totalPages, 1) })}</span>{totalPages > 1 && <div className="flex gap-2"><Button size="sm" variant="outline" aria-label={tCommon("accessibility.previousPage")} disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={14} /></Button><Button size="sm" variant="outline" aria-label={tCommon("accessibility.nextPage")} disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={14} /></Button></div>}</div>
    </div>
    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={t("withdrawals.accessibility.detailDialog", { customer: detail.customer.displayName })} onClick={() => setDetail(null)}><aside className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:max-h-[calc(100vh-3rem)] sm:p-6" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-start"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">{t("withdrawals.detail.eyebrow")}</p><h2 className="text-xl font-bold">{detail.customer.displayName}</h2><p className="text-sm text-muted-foreground">{detail.customer.email}</p></div><button type="button" onClick={() => setDetail(null)} aria-label={t("withdrawals.accessibility.close")}><X size={20} /></button></div>
      <div className="grid grid-cols-2 gap-3 mt-5 text-sm"><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{t("withdrawals.detail.amount")}</p><p className="font-mono font-bold">{formatRM(detail.amountSen)}</p></div><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{t("withdrawals.detail.status")}</p><StatusBadge status={detail.status} /></div><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{t("withdrawals.detail.appKyc")}</p><p>{displayStatus(detail.customer.kycStatus)}</p></div><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{t("withdrawals.detail.risk")}</p><p className={detail.riskLevel === "high" ? "text-red-600 font-semibold" : ""}>{displayStatus(detail.riskLevel)}{detail.riskOverridden ? ` · ${t("withdrawals.detail.overridden")}` : ""}</p></div></div>
      <section className="mt-4 rounded-xl border border-border bg-muted/20 p-4"><div className="flex items-center justify-between"><p className="font-semibold text-sm">{t("withdrawals.readiness.title")}</p><span className="text-[11px] font-semibold text-muted-foreground">{t("withdrawals.readiness.reviewPriority", { priority: t(getReviewPriority(detail).labelKey) })}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{[
        { key: "appKyc", label: t("withdrawals.detail.appKyc"), value: displayStatus(detail.customer.kycStatus), ready: detail.customer.kycStatus === "approved" },
        { key: "walletEvidence", label: t("withdrawals.readiness.walletEvidence"), value: hasReviewEvidence ? t("withdrawals.readiness.available") : t("withdrawals.readiness.unavailable"), ready: hasReviewEvidence },
        { key: "payoutDestination", label: t("withdrawals.readiness.payoutDestination"), value: detail.destinationLabel || t("withdrawals.detail.notSupplied"), ready: Boolean(detail.destinationLabel) },
        { key: "approvalProgress", label: t("withdrawals.table.approvalProgress"), value: detail.requiresDualApproval ? t("withdrawals.table.dualApprovals", { count: Math.min(detail.approvalCount, 2) }) : t("withdrawals.readiness.singleApproval"), ready: !detail.requiresDualApproval || detail.approvalCount >= 2 },
      ].map((check) => <div key={check.key} className="flex items-start gap-2 rounded-lg bg-card px-3 py-2.5"><span className={check.ready ? "text-emerald-600" : "text-amber-600"}>{check.ready ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span><div><p className="text-xs font-semibold text-foreground">{check.label}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{check.value}</p></div></div>)}</div></section>
      <div className="rounded-xl border border-border p-4 mt-4 text-sm"><p className="font-semibold mb-2">{t("withdrawals.balances.title")}</p><p>{t("withdrawals.balances.topUp")}: {formatRM(detail.wallet.topupSen)}</p><p>{t("withdrawals.balances.earnings")}: {formatRM(detail.wallet.earningsSen)}</p><p>{t("withdrawals.balances.pendingRewards")}: {formatRM(detail.wallet.pendingEarningsSen)}</p><p>{t("withdrawals.balances.reserved")}: {formatRM(detail.wallet.reservedSen)}</p><p>{t("withdrawals.balances.withdrawn")}: {formatRM(detail.wallet.withdrawnSen)}</p><p className="mt-2 text-muted-foreground">{t("withdrawals.readiness.payoutDestination")}: {detail.destinationLabel}</p></div>
      {!hasReviewEvidence && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 mt-4 text-sm text-amber-950"><p className="font-semibold">{t("withdrawals.evidence.unavailable")}</p><p>{t("withdrawals.evidence.doNotApprove")}</p></div>}
      <ReviewLedgerSection title={t("withdrawals.evidence.rewardSources")} rows={detail.reviewSources.rewardSources} emptyMessage={t("withdrawals.evidence.noRewardTransactions")} locale={locale} displayEnum={displayStatus} formatAmount={formatRM} />
      <ReviewLedgerSection title={t("withdrawals.evidence.affiliateSources")} rows={detail.reviewSources.affiliateSources} emptyMessage={t("withdrawals.evidence.noAffiliateTransactions")} locale={locale} displayEnum={displayStatus} formatAmount={formatRM} />
      <ReviewLedgerSection title={t("withdrawals.evidence.walletTransactions")} rows={detail.reviewSources.walletTransactions} emptyMessage={t("withdrawals.evidence.noWalletTransactions")} locale={locale} displayEnum={displayStatus} formatAmount={formatRM} />
      <section className="rounded-xl border border-border p-4 mt-4 text-sm"><p className="font-semibold mb-2">{t("withdrawals.evidence.fraudFlags")}</p>{detail.reviewSources.fraudFlags.length === 0 ? <p className="text-xs text-muted-foreground">{hasReviewEvidence ? t("withdrawals.evidence.noFraudFlags") : t("withdrawals.evidence.unavailable")}</p> : <ul className="list-disc pl-5 space-y-1">{detail.reviewSources.fraudFlags.map((flag, index) => <li key={index}>{typeof flag === "string" ? flag : JSON.stringify(flag)}</li>)}</ul>}</section>
      {(detail.payoutFailure.code || detail.payoutFailure.message || detail.payoutFailure.category) && <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 mt-4 text-sm"><p className="font-semibold mb-2">{t("withdrawals.payoutFailure.title")}</p><p>{t("withdrawals.payoutFailure.provider")}: {detail.payoutFailure.provider ?? t("withdrawals.detail.unknown")}</p><p>{t("withdrawals.payoutFailure.category")}: {displayStatus(detail.payoutFailure.category)}</p><p>{t("withdrawals.payoutFailure.code")}: {detail.payoutFailure.code ?? t("withdrawals.detail.notSupplied")}</p><p>{t("withdrawals.payoutFailure.reason")}: {detail.payoutFailure.message ?? t("withdrawals.payoutFailure.noProviderMessage")}</p><p>{t("withdrawals.payoutFailure.retryable")}: {detail.payoutFailure.retryable ? t("withdrawals.common.yes") : t("withdrawals.common.no")}</p></section>}
      <div className="rounded-xl border border-border p-4 mt-4"><p className="font-semibold mb-2">{t("withdrawals.timeline.title")}</p>{detail.approvals.length === 0 ? <p className="text-sm text-muted-foreground">{t("withdrawals.timeline.noDecisions")}</p> : detail.approvals.map((approval) => <div key={`${approval.actorId}-${approval.action}-${approval.createdAt}`} className="py-2 border-b last:border-0 text-sm"><p>{approval.actorLabel} · {displayStatus(approval.action)}</p><p className="text-xs text-muted-foreground">{new Date(approval.createdAt).toLocaleString(locale)}{approval.note ? ` · ${approval.note}` : ""}</p></div>)}</div>
      {detail.customerReason && <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mt-4 text-sm"><p className="font-semibold">{t("withdrawals.customerReason.title")}</p><p>{detail.customerReason}</p></div>}

      {canChooseDecision && <div className="mt-5 rounded-xl border border-border p-4"><p className="font-semibold text-sm mb-1">{t("withdrawals.decision.title")}</p><p className="text-xs text-muted-foreground mb-3">{t("withdrawals.decision.description")}</p><div role="group" aria-label={t("withdrawals.accessibility.decisionGroup")} className="grid gap-3 sm:grid-cols-2">
        {availableDecisions.map((decision) => <div key={decision} className="rounded-lg border border-border p-3"><Button variant={decision === "approve" ? "default" : "outline"} className={decision === "hold" ? "!border-2 !border-slate-300 !bg-white !text-slate-700 hover:!bg-slate-50" : decision === "reject" ? "!border-2 !border-red-300 !bg-red-50 !text-red-700 hover:!bg-red-100" : ""} style={decision === "hold" ? { borderWidth: 2, borderStyle: "solid", borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#334155" } : decision === "reject" ? { borderWidth: 2, borderStyle: "solid", borderColor: "#fca5a5", backgroundColor: "#fef2f2", color: "#b91c1c" } : undefined} onClick={() => chooseDecision(decision)} aria-pressed={selectedDecision === decision}>{decisionLabel(decision)}</Button><p className="text-xs text-muted-foreground mt-2">{t(DECISION_COPY[decision].descriptionKey)}</p><p className="text-xs font-medium mt-1">{t("withdrawals.decision.afterThis", { consequence: t(DECISION_COPY[decision].consequenceKey) })}</p></div>)}
      </div>

      {selectedDecision ? <div className="mt-4 border-t border-border pt-4"><div className="rounded-lg bg-muted/40 p-3 mb-3 text-sm"><p className="font-semibold">{decisionLabel(selectedDecision)}</p><p className="text-muted-foreground">{t(DECISION_COPY[selectedDecision].descriptionKey)}</p><p className="mt-1 text-xs text-muted-foreground">{t(DECISION_COPY[selectedDecision].consequenceKey)}</p></div>{activeReasonAction && <label className="block text-sm"><span className="block font-medium mb-1">{t("withdrawals.decision.reasonLabel")}</span><select value={reasonCategory} onChange={(e) => { setReasonCategory(e.target.value); setError(""); setPendingConfirmation(null); }} className="w-full rounded-xl border border-border bg-background p-3 text-sm"><option value="">{t("withdrawals.decision.selectReason")}</option>{WALLET_REASON_RULES[activeReasonAction].map((category) => <option key={category} value={category}>{decisionReason(activeReasonAction, category)}</option>)}</select></label>}<label className="block text-sm mt-3"><span className="block font-medium mb-1">{t("withdrawals.decision.adminNote")}</span><textarea value={reason} onChange={(e) => { setReason(e.target.value); setError(""); setPendingConfirmation(null); }} placeholder={t(DECISION_COPY[selectedDecision].placeholderKey)} maxLength={500} className="w-full min-h-24 rounded-xl border border-border bg-background p-3 text-sm" /><span className="text-xs text-muted-foreground">{t("withdrawals.decision.minimumNote")}</span></label>{error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}<Button className="mt-3" onClick={submitAction} disabled={loading || !reasonCategory || reason.trim().length < 10}>{t("withdrawals.decision.continueToConfirmation")}</Button></div> : <p className="mt-4 text-xs text-muted-foreground">{t("withdrawals.decision.selectDecisionPrompt")}</p>}

      {pendingConfirmation && <div role="dialog" aria-modal="true" aria-labelledby="confirm-withdrawal-title" className="mt-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-sm"><h3 id="confirm-withdrawal-title" className="font-semibold">{t("withdrawals.confirmation.title")}</h3><p className="mt-2">{t("withdrawals.confirmation.customer")}: {detail.customer.displayName}</p><p>{t("withdrawals.confirmation.amount")}: {formatRM(detail.amountSen)}</p><p>{t("withdrawals.confirmation.destination")}: {detail.destinationLabel}</p><p>{t("withdrawals.confirmation.decision")}: {decisionLabel(pendingConfirmation.action)}</p><p>{t("withdrawals.confirmation.reason")}: {decisionReason(toWalletReasonAction(pendingConfirmation.action), pendingConfirmation.reasonCategory)}</p><p>{t("withdrawals.confirmation.note")}: {pendingConfirmation.reason}</p><div className="flex flex-wrap gap-2 mt-4"><Button onClick={() => void confirmAction()} disabled={loading}>{t("withdrawals.confirmation.confirm")}</Button><Button variant="outline" onClick={() => setPendingConfirmation(null)} disabled={loading}>{t("withdrawals.confirmation.cancel")}</Button></div></div>}
      <p className="text-xs text-muted-foreground mt-3">{t("withdrawals.timeline.auditNote")}</p></div>}
    </aside></div>}
    </div>
  </div>;
}

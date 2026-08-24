"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import type { AdminSettlementProof } from "@/lib/payouts/settlement-proof";
import type { WithdrawalAvailableAction } from "@/lib/wallet/withdrawal-capabilities";
import type { WithdrawalReviewDetail as WithdrawalReviewDetailData, WithdrawalReviewLedgerRow } from "@/lib/wallet/withdrawal-review";
import { isWalletReasonCategory, WALLET_REASON_CATEGORIES, type WalletReasonAction } from "@/lib/validation/wallet-reason-schemas";

type PendingConfirmation = { action: WithdrawalAvailableAction; reasonCategory: string; reason: string };

const DECISION_COPY: Record<WithdrawalAvailableAction, { labelKey: string; descriptionKey: string; consequenceKey: string; placeholderKey: string }> = {
  approve: { labelKey: "withdrawals.decisions.approve.label", descriptionKey: "withdrawals.decisions.approve.description", consequenceKey: "withdrawals.decisions.approve.consequence", placeholderKey: "withdrawals.decisions.approve.placeholder" },
  hold: { labelKey: "withdrawals.decisions.hold.label", descriptionKey: "withdrawals.decisions.hold.description", consequenceKey: "withdrawals.decisions.hold.consequence", placeholderKey: "withdrawals.decisions.hold.placeholder" },
  reject: { labelKey: "withdrawals.decisions.reject.label", descriptionKey: "withdrawals.decisions.reject.description", consequenceKey: "withdrawals.decisions.reject.consequence", placeholderKey: "withdrawals.decisions.reject.placeholder" },
  resume: { labelKey: "withdrawals.decisions.resume.label", descriptionKey: "withdrawals.decisions.resume.description", consequenceKey: "withdrawals.decisions.resume.consequence", placeholderKey: "withdrawals.decisions.resume.placeholder" },
  "fraud-override": { labelKey: "withdrawals.decisions.fraudOverride.label", descriptionKey: "withdrawals.decisions.fraudOverride.description", consequenceKey: "withdrawals.decisions.fraudOverride.consequence", placeholderKey: "withdrawals.decisions.fraudOverride.placeholder" },
};

const DECISION_REASON_COPY: Record<WalletReasonAction, Record<string, string>> = {
  hold: { insufficient_payout_information: "withdrawals.reasons.insufficientPayoutInformation", kyc_or_identity_review: "withdrawals.reasons.kycOrIdentityReview", risk_review_required: "withdrawals.reasons.riskReviewRequired", payout_account_unavailable: "withdrawals.reasons.payoutAccountUnavailable", other: "withdrawals.reasons.other" },
  reject: { bank_details_mismatch: "withdrawals.reasons.bankDetailsMismatch", kyc_or_identity_review: "withdrawals.reasons.kycOrIdentityReview", risk_review_required: "withdrawals.reasons.riskReviewRequired", payout_account_unavailable: "withdrawals.reasons.payoutAccountUnavailable", other: "withdrawals.reasons.other" },
  resume: { additional_information_verified: "withdrawals.reasons.additionalInformationVerified", bank_details_confirmed: "withdrawals.reasons.bankDetailsConfirmed", kyc_review_completed: "withdrawals.reasons.kycReviewCompleted", risk_review_cleared: "withdrawals.reasons.riskReviewCleared", other: "withdrawals.reasons.other" },
  approve: { review_completed: "withdrawals.reasons.reviewCompleted", payout_ready: "withdrawals.reasons.payoutReady", other: "withdrawals.reasons.other" },
  fraud_override: { risk_reviewed: "withdrawals.reasons.riskReviewed", false_positive: "withdrawals.reasons.falsePositive", exception_approved: "withdrawals.reasons.exceptionApproved", other: "withdrawals.reasons.other" },
  adjustment: {}, settings: {}, approver_role: {},
};

const ENUM_VALUE_KEYS: Record<string, string> = {
  approve: "withdrawals.decisions.approve.label", approved: "withdrawals.status.approved", completed: "withdrawals.status.completed", credit: "withdrawals.enumValues.credit", debit: "withdrawals.enumValues.debit", earnings: "withdrawals.enumValues.earnings", earnings_confirm: "withdrawals.enumValues.earningsConfirm", earnings_pending: "withdrawals.enumValues.earningsPending", earnings_reverse: "withdrawals.enumValues.earningsReverse", failed: "withdrawals.status.failed", fraud_override: "withdrawals.decisions.fraudOverride.label", high: "withdrawals.risk.high", hold: "withdrawals.decisions.hold.label", low: "withdrawals.risk.low", paid: "withdrawals.status.paid", pending: "withdrawals.status.pending", pending_earnings: "withdrawals.enumValues.pendingEarnings", pending_second_approval: "withdrawals.status.pending_second_approval", processing: "withdrawals.status.processing", reject: "withdrawals.decisions.reject.label", rejected: "withdrawals.status.rejected", resume: "withdrawals.decisions.resume.label", review: "withdrawals.risk.review", reward_cleared: "withdrawals.enumValues.rewardCleared", reward_pending: "withdrawals.enumValues.rewardPending", topup: "withdrawals.enumValues.topUp", unverified: "withdrawals.enumValues.unverified", withdrawal_complete: "withdrawals.enumValues.withdrawalComplete", withdrawal_release: "withdrawals.enumValues.withdrawalRelease", withdrawal_reserve: "withdrawals.enumValues.withdrawalReserve",
};

function toWalletReasonAction(action: WithdrawalAvailableAction): WalletReasonAction {
  return action === "fraud-override" ? "fraud_override" : action;
}

function ReviewLedgerSection({ title, rows, emptyMessage, locale, displayEnum, formatAmount }: { title: string; rows: WithdrawalReviewLedgerRow[]; emptyMessage: string; locale: string; displayEnum: (value: string | null | undefined) => string; formatAmount: (valueSen: number) => string }) {
  return <section className="mt-4 rounded-xl border border-border p-4 text-sm"><p className="mb-2 font-semibold">{title}</p>{rows.length === 0 ? <p className="text-xs text-muted-foreground">{emptyMessage}</p> : <div className="space-y-2">{rows.map((row) => <div key={row.id} className="border-b border-border/60 pb-2 last:border-0 last:pb-0"><div className="flex justify-between gap-3"><span>{displayEnum(row.type)} · {displayEnum(row.direction)}</span><span className="font-mono">{formatAmount(row.amountSen)}</span></div><p className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString(locale)}{row.note ? ` · ${row.note}` : ""}</p></div>)}</div>}</section>;
}

function SettlementProofSection({ proof, locale, formatAmount }: { proof: AdminSettlementProof; locale: string; formatAmount: (valueSen: number) => string }) {
  const { t } = useTranslation("admin");
  const eventHash = proof.event?.payloadSha256 ? `${proof.event.payloadSha256.slice(0, 12)}…${proof.event.payloadSha256.slice(-8)}` : null;
  return <section className="mt-4 rounded-xl border border-nature-green/30 bg-nature-green/5 p-4 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{t("withdrawals.settlementProof.title")}</h3><p className="mt-1 text-xs text-muted-foreground">{t(proof.event ? "withdrawals.settlementProof.noFurtherAction" : "withdrawals.settlementProof.awaitingProvider")}</p></div>{proof.event?.signatureVerified && <span className="inline-flex items-center gap-1 rounded-full bg-nature-green/15 px-2 py-1 text-xs font-semibold text-nature-green-ink"><ShieldCheck size={13} />{t("withdrawals.settlementProof.signatureVerified")}</span>}</div><dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-muted-foreground">{t("withdrawals.settlementProof.provider")}</dt><dd>{proof.provider}</dd></div><div><dt className="text-muted-foreground">{t("withdrawals.settlementProof.payoutReference")}</dt><dd className="break-all font-mono">{proof.providerPayoutReference ?? "—"}</dd></div>{proof.event && <><div><dt className="text-muted-foreground">{t("withdrawals.settlementProof.eventId")}</dt><dd className="break-all font-mono">{proof.event.id}</dd></div><div><dt className="text-muted-foreground">{t("withdrawals.settlementProof.eventStatus")}</dt><dd>{proof.event.status}</dd></div><div><dt className="text-muted-foreground">{t("withdrawals.settlementProof.amount")}</dt><dd>{formatAmount(proof.event.amountSen)} {proof.event.currency}</dd></div><div><dt className="text-muted-foreground">{t("withdrawals.settlementProof.providerTime")}</dt><dd>{new Date(proof.event.providerOccurredAt).toLocaleString(locale)}</dd></div>{eventHash && <div><dt className="text-muted-foreground">{t("withdrawals.settlementProof.payloadHash")}</dt><dd className="font-mono">{eventHash}</dd></div>}</>}</dl>{proof.delivery?.needsReconciliation && <div role="alert" className="mt-3 rounded-lg border border-accent bg-accent/10 p-3 text-accent-foreground"><p className="font-semibold">{t("withdrawals.settlementProof.reconciliationTitle")}</p><p className="mt-1 text-xs">{t("withdrawals.settlementProof.reconciliationMessage")}</p></div>}<div className="mt-3"><p className="text-xs font-semibold">{t("withdrawals.settlementProof.ledgerTitle")}</p>{proof.ledger.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">{t("withdrawals.settlementProof.noLedger")}</p> : <div className="mt-2 space-y-1">{proof.ledger.map((row) => <div key={row.id} className="flex justify-between gap-3 text-xs"><span>{row.type} · {row.direction}</span><span className="font-mono">{formatAmount(row.amountSen)}</span></div>)}</div>}</div><p className="mt-3 text-xs text-muted-foreground">{t("withdrawals.settlementProof.immutableNotice")}</p></section>;
}

export function WithdrawalReviewDetail({ withdrawalId }: { withdrawalId: string }) {
  const { t, i18n } = useTranslation("admin");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { showFeedback } = useActionFeedback();
  const [detail, setDetail] = useState<WithdrawalReviewDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDecision, setSelectedDecision] = useState<WithdrawalAvailableAction | null>(null);
  const [reason, setReason] = useState("");
  const [reasonCategory, setReasonCategory] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const loadDetail = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/admin/withdrawals/${withdrawalId}`, { cache: "no-store" });
      const body = await response.json() as { data?: WithdrawalReviewDetailData; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t("withdrawals.errors.loadReviewDetails"));
      setDetail({ ...body.data, reviewSources: body.data.reviewSources ?? { rewardSources: [], affiliateSources: [], walletTransactions: [], fraudFlags: [] }, payoutFailure: body.data.payoutFailure ?? { provider: null, eventId: null, code: null, message: null, category: null, occurredAt: null, retryable: null }, settlementProof: body.data.settlementProof ?? null, availableActions: body.data.availableActions ?? [] });
      setError("");
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : t("withdrawals.errors.loadReviewDetails"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [t, withdrawalId]);

  useEffect(() => { void Promise.resolve().then(() => loadDetail()); }, [loadDetail]);
  useEffect(() => {
    if (!detail || !["approved", "processing"].includes(detail.status)) return;
    let inFlight = false;
    const interval = window.setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void loadDetail(true).finally(() => { inFlight = false; });
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [detail, loadDetail]);

  const displayStatus = (value: string | null | undefined) => value ? t(ENUM_VALUE_KEYS[value] ?? "withdrawals.status.unknown") : t("withdrawals.status.notAssessed");
  const formatRM = (valueSen: number) => `RM ${(valueSen / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const decisionLabel = (action: WithdrawalAvailableAction) => t(DECISION_COPY[action].labelKey);
  const decisionReason = (action: WalletReasonAction, category: string) => t(DECISION_REASON_COPY[action][category] ?? "withdrawals.reasons.other");

  function chooseDecision(action: WithdrawalAvailableAction) {
    setSelectedDecision(action); setReason(""); setReasonCategory(""); setPendingConfirmation(null); setError("");
  }

  function continueToConfirmation() {
    if (!selectedDecision || !reasonCategory || reason.trim().length < 10) {
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
    if (!pendingConfirmation) return;
    const { action: nextAction, reason: pendingReason, reasonCategory: pendingCategory } = pendingConfirmation;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/withdrawals/${withdrawalId}/${nextAction}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(nextAction === "approve" ? { note: pendingReason, reasonCategory: pendingCategory } : { reason: pendingReason, reasonCategory: pendingCategory }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? t("withdrawals.errors.actionFailed"));
      showFeedback("success", nextAction === "fraud-override" ? t("withdrawals.feedback.riskOverrideRecorded") : t("withdrawals.feedback.actionCompleted"));
      setSelectedDecision(null); setReason(""); setReasonCategory(""); setPendingConfirmation(null);
      await loadDetail(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("withdrawals.errors.actionFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (loading && !detail) return <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">{t("withdrawals.loading")}</div>;
  if (!detail) return <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive"><p>{error || t("withdrawals.errors.loadReviewDetails")}</p><Button className="mt-4" variant="outline" onClick={() => void loadDetail()}>{t("ui.actions.retry")}</Button></div>;

  const hasReviewEvidence = detail.reviewSources.rewardSources.length > 0 || detail.reviewSources.affiliateSources.length > 0 || detail.reviewSources.walletTransactions.length > 0 || detail.reviewSources.fraudFlags.length > 0;
  const activeReasonAction = selectedDecision ? toWalletReasonAction(selectedDecision) : null;

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{t("withdrawals.detail.amount")}</p><p className="font-mono font-bold">{formatRM(detail.amountSen)}</p></div><div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{t("withdrawals.detail.status")}</p><StatusBadge status={detail.status} /></div><div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{t("withdrawals.detail.appKyc")}</p><p>{displayStatus(detail.customer.kycStatus)}</p></div><div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{t("withdrawals.detail.risk")}</p><p className={detail.riskLevel === "high" ? "font-semibold text-red-600" : ""}>{displayStatus(detail.riskLevel)}{detail.riskOverridden ? ` · ${t("withdrawals.detail.overridden")}` : ""}</p></div></section>
      <section className="rounded-xl border border-border bg-card p-4 text-sm"><h2 className="font-semibold">{t("withdrawals.readiness.title")}</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{[
        { key: "appKyc", label: t("withdrawals.detail.appKyc"), value: displayStatus(detail.customer.kycStatus), ready: detail.customer.kycStatus === "approved" },
        { key: "walletEvidence", label: t("withdrawals.readiness.walletEvidence"), value: hasReviewEvidence ? t("withdrawals.readiness.available") : t("withdrawals.readiness.unavailable"), ready: hasReviewEvidence },
        { key: "payoutDestination", label: t("withdrawals.readiness.payoutDestination"), value: detail.destinationLabel, ready: Boolean(detail.destinationLabel) },
        { key: "approvalProgress", label: t("withdrawals.table.approvalProgress"), value: detail.requiresDualApproval ? t("withdrawals.table.dualApprovals", { count: Math.min(detail.approvalCount, 2) }) : t("withdrawals.readiness.singleApproval"), ready: !detail.requiresDualApproval || detail.approvalCount >= 2 },
      ].map((check) => <div key={check.key} className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5"><span className={check.ready ? "text-emerald-600" : "text-amber-600"}>{check.ready ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span><div><p className="text-xs font-semibold">{check.label}</p><p className="text-[11px] text-muted-foreground">{check.value}</p></div></div>)}</div></section>
      <section className="rounded-xl border border-border bg-card p-4 text-sm"><h2 className="font-semibold">{t("withdrawals.balances.title")}</h2><div className="mt-2 grid gap-1 sm:grid-cols-2"><p>{t("withdrawals.balances.topUp")}: {formatRM(detail.wallet.topupSen)}</p><p>{t("withdrawals.balances.earnings")}: {formatRM(detail.wallet.earningsSen)}</p><p>{t("withdrawals.balances.pendingRewards")}: {formatRM(detail.wallet.pendingEarningsSen)}</p><p>{t("withdrawals.balances.reserved")}: {formatRM(detail.wallet.reservedSen)}</p><p>{t("withdrawals.balances.withdrawn")}: {formatRM(detail.wallet.withdrawnSen)}</p><p>{t("withdrawals.readiness.payoutDestination")}: {detail.destinationLabel}</p></div></section>
      {detail.settlementProof && <SettlementProofSection proof={detail.settlementProof} locale={locale} formatAmount={formatRM} />}
      {!hasReviewEvidence && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">{t("withdrawals.evidence.unavailable")}</p><p>{t("withdrawals.evidence.doNotApprove")}</p></div>}
      <ReviewLedgerSection title={t("withdrawals.evidence.rewardSources")} rows={detail.reviewSources.rewardSources} emptyMessage={t("withdrawals.evidence.noRewardTransactions")} locale={locale} displayEnum={displayStatus} formatAmount={formatRM} />
      <ReviewLedgerSection title={t("withdrawals.evidence.affiliateSources")} rows={detail.reviewSources.affiliateSources} emptyMessage={t("withdrawals.evidence.noAffiliateTransactions")} locale={locale} displayEnum={displayStatus} formatAmount={formatRM} />
      <ReviewLedgerSection title={t("withdrawals.evidence.walletTransactions")} rows={detail.reviewSources.walletTransactions} emptyMessage={t("withdrawals.evidence.noWalletTransactions")} locale={locale} displayEnum={displayStatus} formatAmount={formatRM} />
      <section className="rounded-xl border border-border bg-card p-4 text-sm"><h2 className="font-semibold">{t("withdrawals.evidence.fraudFlags")}</h2>{detail.reviewSources.fraudFlags.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">{t("withdrawals.evidence.noFraudFlags")}</p> : <ul className="mt-2 list-disc space-y-1 pl-5">{detail.reviewSources.fraudFlags.map((flag, index) => <li key={index}>{typeof flag === "string" ? flag : JSON.stringify(flag)}</li>)}</ul>}</section>
    </div>

    <aside className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 text-sm"><h2 className="font-semibold">{detail.customer.displayName}</h2><p className="mt-1 text-muted-foreground">{detail.customer.email}</p>{detail.customerReason && <div className="mt-3 rounded-lg bg-amber-50 p-3"><p className="font-semibold">{t("withdrawals.customerReason.title")}</p><p>{detail.customerReason}</p></div>}</section>
      {(detail.payoutFailure.code || detail.payoutFailure.message || detail.payoutFailure.category) && <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm"><h2 className="font-semibold">{t("withdrawals.payoutFailure.title")}</h2><p>{t("withdrawals.payoutFailure.provider")}: {detail.payoutFailure.provider ?? t("withdrawals.detail.unknown")}</p><p>{t("withdrawals.payoutFailure.code")}: {detail.payoutFailure.code ?? t("withdrawals.detail.notSupplied")}</p><p>{t("withdrawals.payoutFailure.reason")}: {detail.payoutFailure.message ?? t("withdrawals.payoutFailure.noProviderMessage")}</p></section>}
      <section className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold">{t("withdrawals.timeline.title")}</h2>{detail.approvals.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("withdrawals.timeline.noDecisions")}</p> : detail.approvals.map((approval) => <div key={`${approval.actorId}-${approval.action}-${approval.createdAt}`} className="border-b py-2 text-sm last:border-0"><p>{approval.actorLabel} · {displayStatus(approval.action)}</p><p className="text-xs text-muted-foreground">{new Date(approval.createdAt).toLocaleString(locale)}{approval.note ? ` · ${approval.note}` : ""}</p></div>)}</section>
      {detail.availableActions.length > 0 && <section className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold">{t("withdrawals.decision.title")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("withdrawals.decision.description")}</p><div className="mt-3 grid gap-2">{detail.availableActions.map((decision) => <Button key={decision} variant={decision === "approve" ? "default" : decision === "reject" ? "destructive" : "outline"} onClick={() => chooseDecision(decision)} aria-pressed={selectedDecision === decision}>{decisionLabel(decision)}</Button>)}</div>{selectedDecision && activeReasonAction && <div className="mt-4 border-t border-border pt-4"><label className="block text-sm"><span className="font-medium">{t("withdrawals.decision.reasonLabel")}</span><select value={reasonCategory} onChange={(event) => { setReasonCategory(event.target.value); setPendingConfirmation(null); setError(""); }} className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm"><option value="">{t("withdrawals.decision.selectReason")}</option>{WALLET_REASON_CATEGORIES[activeReasonAction].map((category) => <option key={category} value={category}>{decisionReason(activeReasonAction, category)}</option>)}</select></label><label className="mt-3 block text-sm"><span className="font-medium">{t("withdrawals.decision.adminNote")}</span><textarea value={reason} onChange={(event) => { setReason(event.target.value); setPendingConfirmation(null); setError(""); }} maxLength={500} placeholder={t(DECISION_COPY[selectedDecision].placeholderKey)} className="mt-1 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" /></label><Button className="mt-3" onClick={continueToConfirmation} disabled={loading || !reasonCategory || reason.trim().length < 10}>{t("withdrawals.decision.continueToConfirmation")}</Button></div>}</section>}
      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">{t("withdrawals.timeline.auditNote")}</p>
    </aside>

    <AdminConfirmDialog open={pendingConfirmation != null} title="withdrawals.confirmation.title" description={selectedDecision ? DECISION_COPY[selectedDecision].consequenceKey : "withdrawals.decision.description"} confirmLabel="withdrawals.confirmation.confirm" confirmVariant={selectedDecision === "reject" ? "destructive" : "default"} busy={loading} onCancel={() => setPendingConfirmation(null)} onConfirm={() => void confirmAction()} />
  </div>;
}

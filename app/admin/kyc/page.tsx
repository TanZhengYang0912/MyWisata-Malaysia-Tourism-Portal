"use client";

import { useEffect, useState } from "react";
import { CheckSquare, Clock3, ExternalLink, FileCheck2, FileWarning, MessageSquare, ShieldCheck, UserRound, XCircle } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getUsers } from "@/backend/domains/identity";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminBatchActionBar } from "@/components/admin/batch-action-bar";
import { useActionFeedback } from "@/components/providers/action-feedback";
import type { AdminKycSubmission, User } from "@/backend/core/types";
import { KYC_REVIEW_REASON_CODES, type KycReviewReasonCode } from "@/lib/kyc/types";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";

const DOC_LABEL: Record<string, string> = { national_id: "MyKad", passport: "Passport", driving_license: "Driving licence / MyPolis" };
const REVIEW_REASON_LABELS: Record<KycReviewReasonCode, string> = {
  document_unreadable: "Document is unreadable", document_incomplete: "Document is incomplete", document_mismatch: "Document details do not match", document_expired: "Document is expired", document_suspected_tampering: "Document is suspected of tampering", other: "Other (add details)",
};

type PendingAction = { userId: string; action: "reject" | "request_info"; reasonCode: KycReviewReasonCode | ""; reasonDetail: string } | null;
type ConfirmAction = { userId: string; action: "approve" | "reject" | "request_info"; reasonCode?: KycReviewReasonCode; reasonDetail?: string } | null;

function dateLabel(value: string | null | undefined, locale: AppLocale) {
  return value ? new Date(value).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export default function AdminKycPage() {
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const { t, i18n } = useTranslation("admin");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [users, setUsers] = useState<User[]>([]);
  const [submissions, setSubmissions] = useState<Map<string, AdminKycSubmission>>(new Map());
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  async function load() {
    try {
      const [allUsers, response] = await Promise.all([getUsers(), fetch("/api/admin/kyc/submissions", { cache: "no-store" })]);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t("kyc.errors.loadSubmissions", { defaultValue: "Unable to load KYC submissions" }));
      setUsers(allUsers.filter((user) => user.role === "customer"));
      setSubmissions(new Map((body.data?.submissions ?? []).map((submission: AdminKycSubmission) => [submission.userId, submission])));
    } catch (err) { setError(err instanceof Error ? err.message : t("kyc.errors.loadQueue", { defaultValue: "Unable to load KYC review queue" })); }
  }

  useEffect(() => { void load(); }, []);

  async function review(userId: string, action: "approve" | "reject" | "request_info", reasonCode?: KycReviewReasonCode, reasonDetail?: string) {
    if (!currentUser || reviewing) return;
    if (action !== "approve" && !reasonCode) { setError(t("kyc.errors.selectReason", { defaultValue: "Select a review reason." })); return; }
    if (reasonCode === "other" && (reasonDetail?.trim().length ?? 0) < 10) { setError(t("kyc.errors.otherDetail", { defaultValue: "Add at least 10 characters of detail for Other." })); return; }
    setReviewing(userId); setError(null);
    try {
      const response = await fetch("/api/admin/kyc/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, action, ...(reasonCode ? { reasonCode } : {}), ...(reasonDetail?.trim() ? { reasonDetail: reasonDetail.trim() } : {}) }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t("kyc.errors.reviewFailed", { defaultValue: "Review failed." }));
      setSubmissions((previous) => { const next = new Map(previous); next.delete(userId); return next; });
      if (action === "approve") setUsers((previous) => previous.map((user) => user.id === userId ? { ...user, verificationTier: "kyc_verified" } : user));
      showFeedback("success", action === "approve" ? t("kyc.success.approved", { defaultValue: "KYC submission approved." }) : action === "reject" ? t("kyc.success.rejected", { defaultValue: "KYC submission rejected." }) : t("kyc.success.infoRequested", { defaultValue: "Information request sent." }));
      setPendingAction(null); setConfirmAction(null);
    } catch (err) { const message = err instanceof Error ? err.message : t("kyc.errors.reviewFailed", { defaultValue: "Review failed." }); setError(message); showFeedback("error", message); }
    finally { setReviewing(null); }
  }

  async function openDocument(submission: AdminKycSubmission, side: "front" | "back") {
    try {
      const response = await fetch(`/api/admin/kyc/documents/${submission.id}/${side}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.data?.signedUrl) throw new Error(body.error?.message ?? t("kyc.errors.loadDocument", { defaultValue: "Failed to load document" }));
      window.open(body.data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) { showFeedback("error", err instanceof Error ? err.message : t("kyc.errors.loadDocument", { defaultValue: "Failed to load document" })); }
  }

  async function applyBatch(action: "approve" | "request_info" | "reject") {
    if (!currentUser || batchBusy) return;
    const selected = pending.filter((user) => selectedIds.has(user.id));
    if (!selected.length) return;
    let reasonCode: KycReviewReasonCode | undefined;
    let reasonDetail: string | undefined;
    if (action !== "approve") {
      const reasonOptions = KYC_REVIEW_REASON_CODES.map((code) => `${code}: ${t(`kyc.reasons.${code}`, { defaultValue: REVIEW_REASON_LABELS[code] })}`).join(", ");
      const enteredCode = window.prompt(t("kyc.prompts.reasonCode", { reasons: reasonOptions }), "other")?.trim() as KycReviewReasonCode | undefined;
      if (!enteredCode || !KYC_REVIEW_REASON_CODES.includes(enteredCode)) {
        setError(t("kyc.errors.invalidReason", { defaultValue: "Choose a valid KYC review reason code." }));
        return;
      }
      reasonCode = enteredCode;
      if (reasonCode === "other") {
        reasonDetail = window.prompt(t("kyc.prompts.otherDetail", { defaultValue: "Add at least 10 characters of detail:" }))?.trim();
        if (!reasonDetail || reasonDetail.length < 10) {
          setError(t("kyc.errors.otherDetail", { defaultValue: "Add at least 10 characters of detail for Other." }));
          return;
        }
      }
    }
    setBatchBusy(true);
    setError(null);
    try {
      const responses = await Promise.all(selected.map((user) => fetch("/api/admin/kyc/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action, ...(reasonCode ? { reasonCode } : {}), ...(reasonDetail ? { reasonDetail } : {}) }),
      })));
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body.error?.message ?? t("kyc.errors.batchFailed", { defaultValue: "One or more KYC reviews failed." }));
      }
      setSelectedIds(new Set());
      showFeedback("success", t("kyc.success.batchProcessed", { defaultValue: "{{count}} KYC submissions processed.", count: selected.length }));
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("kyc.errors.batchReviewFailed", { defaultValue: "Batch KYC review failed." });
      setError(message);
      showFeedback("error", message);
    } finally {
      setBatchBusy(false);
    }
  }

  const pending = users.filter((user) => submissions.has(user.id));
  const verified = users.filter((user) => user.verificationTier === "kyc_verified");
  const infoRequested = pending.filter((user) => submissions.get(user.id)?.status === "info_requested").length;
  const oldest = pending.map((user) => submissions.get(user.id)?.submittedAt).filter(Boolean).sort()[0];

  return <main className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
    <header><div className="flex items-center gap-2 text-primary"><ShieldCheck size={18} /><p className="text-xs font-semibold uppercase tracking-[0.18em]">{t("kyc.eyebrow", { defaultValue: "Verification operations" })}</p></div><h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl">{t("kyc.title", { defaultValue: "KYC Review" })}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("kyc.description", { defaultValue: "Review identity documents, resolve exceptions and keep verification decisions auditable." })}</p></header>
    {error && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[[t("kyc.metrics.pending", { defaultValue: "Pending review" }), pending.length, t("kyc.metrics.pendingNote", { defaultValue: "Awaiting a decision" })], [t("kyc.metrics.infoRequested", { defaultValue: "Information requested" }), infoRequested, t("kyc.metrics.infoRequestedNote", { defaultValue: "Waiting for customer action" })], [t("kyc.metrics.verified", { defaultValue: "Verified users" }), verified.length, t("kyc.metrics.verifiedNote", { defaultValue: "Current KYC verified accounts" })], [t("kyc.metrics.oldest", { defaultValue: "Oldest queue item" }), oldest ? dateLabel(oldest, locale) : "—", oldest ? t("kyc.metrics.submittedFirst", { defaultValue: "Submitted first" }) : t("kyc.metrics.queueClear", { defaultValue: "Queue is clear" })]].map(([label, value, note]) => <div key={label} className="rounded-2xl border border-border bg-card p-5"><p className="text-sm font-semibold text-muted-foreground">{label}</p><p className="mt-4 text-3xl font-bold tracking-[-0.05em] text-foreground">{value}</p><p className="mt-1 text-xs font-medium text-muted-foreground">{note}</p></div>)}</section>

    <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="font-semibold text-foreground">{t("kyc.queue.title", { defaultValue: "Review queue" })}</h2><p className="mt-1 text-xs text-muted-foreground">{t("kyc.queue.description", { defaultValue: "Open each submission to inspect documents before taking action." })}</p></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 size={14} /> {t("kyc.queue.oldestFirst", { defaultValue: "Oldest first" })}</div></div><div className="flex items-center gap-2 border-b border-border px-5 py-3 text-xs"><input type="checkbox" aria-label={t("kyc.accessibility.selectAll", { defaultValue: "Select all visible KYC submissions" })} checked={pending.length > 0 && selectedIds.size === pending.length} onChange={(event) => setSelectedIds(event.target.checked ? new Set(pending.map((user) => user.id)) : new Set())} /><span className="text-muted-foreground">{t("kyc.queue.selectAll", { defaultValue: "Select all pending submissions" })}</span></div><AdminBatchActionBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())} onApply={(action) => void applyBatch(action as "approve" | "request_info" | "reject")} actions={[{ value: "approve", label: t("batchActions.approve", { defaultValue: "Approve" }) }, { value: "request_info", label: t("batchActions.request_info", { defaultValue: "Request info" }) }, { value: "reject", label: t("batchActions.reject", { defaultValue: "Reject" }) }]} busy={batchBusy} />
      {pending.length === 0 ? <EmptyState icon={<FileCheck2 size={28} />} title={t("kyc.empty.title", { defaultValue: "No pending KYC submissions" })} description={t("kyc.empty.description", { defaultValue: "New submissions will appear here when customers complete identity verification." })} /> : <div className="divide-y divide-border">{pending.map((user) => { const submission = submissions.get(user.id); const action = pendingAction?.userId === user.id ? pendingAction : null; return <div key={user.id} className="p-5 sm:p-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-start"><div className="flex min-w-0 flex-1 items-start gap-3"><input type="checkbox" aria-label={t("kyc.accessibility.selectSubmission", { defaultValue: "Select KYC submission for {{name}}", name: user.name })} checked={selectedIds.has(user.id)} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); event.target.checked ? next.add(user.id) : next.delete(user.id); return next; })} /><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{user.avatarInitial}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-foreground">{user.name}</p>{submission?.status === "info_requested" && <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">{t("kyc.status.infoRequested", { defaultValue: "Info requested" })}</span>}</div><p className="mt-1 text-sm text-muted-foreground">{submission ? t(`kyc.documents.${submission.docType}`, { defaultValue: DOC_LABEL[submission.docType] ?? submission.docType }) : t("kyc.fallback.noSubmission", { defaultValue: "No submission data" })}</p><p className="mt-1 text-xs text-muted-foreground">{t("kyc.submitted", { defaultValue: "Submitted {{date}} · Queue position {{position}}", date: dateLabel(submission?.submittedAt, locale), position: submission?.queuePosition ?? "—" })}</p></div></div><div className="flex flex-wrap items-center gap-2 xl:justify-end">{submission?.documents.map(({ side }) => <Button key={side} variant="outline" size="sm" onClick={() => void openDocument(submission, side)}><ExternalLink size={14} /> {t("kyc.actions.viewSide", { defaultValue: "View {{side}}", side })}</Button>)}<Button size="sm" disabled={Boolean(reviewing)} onClick={() => setConfirmAction({ userId: user.id, action: "approve" })}><CheckSquare size={14} /> {t("batchActions.approve", { defaultValue: "Approve" })}</Button><Button size="sm" variant="outline" disabled={Boolean(reviewing)} onClick={() => setPendingAction(action?.action === "request_info" ? null : { userId: user.id, action: "request_info", reasonCode: "", reasonDetail: "" })}><MessageSquare size={14} /> {t("batchActions.request_info", { defaultValue: "Request info" })}</Button><Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" disabled={Boolean(reviewing)} onClick={() => setPendingAction(action?.action === "reject" ? null : { userId: user.id, action: "reject", reasonCode: "", reasonDetail: "" })}><XCircle size={14} /> {t("batchActions.reject", { defaultValue: "Reject" })}</Button></div></div>
        {submission?.ocr && <div className="mt-4 grid gap-3 rounded-xl border border-border bg-secondary/30 p-4 text-xs sm:grid-cols-2"><div><p className="font-semibold text-foreground">{t("kyc.ocr.check", { defaultValue: "OCR check:" })} <span className="capitalize">{t(`kyc.ocr.status.${submission.ocr.status}`, { defaultValue: submission.ocr.status })}</span></p><p className="mt-1 text-muted-foreground">{t("kyc.ocr.extractedName", { defaultValue: "Extracted name: {{name}}", name: submission.ocr.holderName ?? t("kyc.fallback.notAvailable", { defaultValue: "Not available" }) })}</p><p className="text-muted-foreground">{t("kyc.ocr.documentEnding", { defaultValue: "Document ending: {{number}}", number: submission.ocr.documentNumberLast4 ?? t("kyc.fallback.notAvailable", { defaultValue: "Not available" }) })}</p></div><div><p className="text-muted-foreground">{t("kyc.ocr.expiryDate", { defaultValue: "Expiry date: {{date}}", date: submission.ocr.expiryDate ?? t("kyc.fallback.notAvailable", { defaultValue: "Not available" }) })}</p>{submission.ocr.mismatchFields.length > 0 ? <p className="mt-1 flex items-start gap-1 text-destructive"><FileWarning size={14} className="mt-0.5 shrink-0" /> {t("kyc.ocr.mismatch", { defaultValue: "Mismatch: {{fields}}", fields: submission.ocr.mismatchFields.join(", ").replaceAll("_", " ") })}</p> : <p className="mt-1 text-emerald-700">{t("kyc.ocr.noMismatch", { defaultValue: "No OCR mismatch detected" })}</p>}</div></div>}
        {action && <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4"><p className="text-sm font-semibold text-foreground">{action.action === "reject" ? t("kyc.action.rejectionReason", { defaultValue: "Rejection reason" }) : t("kyc.action.informationRequested", { defaultValue: "Information requested" })}</p><p className="mt-1 text-xs text-muted-foreground">{t("kyc.action.chooseReason", { defaultValue: "Choose a reason first. You will review the final action in a confirmation step." })}</p><select aria-label={t("kyc.accessibility.reason", { defaultValue: "KYC review reason" })} value={action.reasonCode} onChange={(event) => setPendingAction((current) => current ? { ...current, reasonCode: event.target.value as KycReviewReasonCode | "", reasonDetail: event.target.value === "other" ? current.reasonDetail : "" } : current)} className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">{t("kyc.action.selectReason", { defaultValue: "Select a reason…" })}</option>{KYC_REVIEW_REASON_CODES.filter((code) => action.action === "reject" || code !== "document_suspected_tampering").map((code) => <option key={code} value={code}>{t(`kyc.reasons.${code}`, { defaultValue: REVIEW_REASON_LABELS[code] })}</option>)}</select>{action.reasonCode === "other" && <textarea aria-label={t("kyc.accessibility.details", { defaultValue: "KYC review details" })} rows={3} value={action.reasonDetail} onChange={(event) => setPendingAction((current) => current ? { ...current, reasonDetail: event.target.value } : current)} placeholder={t("kyc.action.detailPlaceholder", { defaultValue: "Add at least 10 characters of detail." })} className="mt-3 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm" />}<div className="mt-3 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setPendingAction(null)}>{t("common.actions.cancel", { defaultValue: "Cancel" })}</Button><Button size="sm" variant={action.action === "reject" ? "destructive" : "default"} disabled={!action.reasonCode || (action.reasonCode === "other" && action.reasonDetail.trim().length < 10)} onClick={() => setConfirmAction({ userId: action.userId, action: action.action, reasonCode: action.reasonCode || undefined, reasonDetail: action.reasonDetail })}>{t("kyc.action.review", { defaultValue: "Review action" })}</Button></div></div>}
      </div>; })}</div>}
    </section>

    <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="font-semibold text-foreground">{t("kyc.verified.title", { defaultValue: "Verified users" })}</h2><p className="mt-1 text-xs text-muted-foreground">{t("kyc.verified.description", { defaultValue: "Accounts that currently hold the verified KYC tier." })}</p></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><UserRound size={14} /> {t("kyc.verified.count", { defaultValue: "{{count}} accounts", count: verified.length })}</div></div>{verified.length === 0 ? <EmptyState title={t("kyc.verified.empty", { defaultValue: "No verified users yet" })} /> : <div className="divide-y divide-border">{verified.map((user) => <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-sm font-medium text-foreground">{user.name}</p><p className="mt-1 text-xs text-muted-foreground">{t("kyc.verified.account", { defaultValue: "Customer account · KYC approved" })}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{t("kyc.verified.badge", { defaultValue: "Verified" })}</span></div>)}</div>}</section>
    <AdminConfirmDialog open={Boolean(confirmAction)} title={confirmAction?.action === "approve" ? t("kyc.confirm.approveTitle", { defaultValue: "Approve KYC submission?" }) : confirmAction?.action === "reject" ? t("kyc.confirm.rejectTitle", { defaultValue: "Reject KYC submission?" }) : t("kyc.confirm.infoTitle", { defaultValue: "Send information request?" })} description={confirmAction?.action === "approve" ? t("kyc.confirm.approveDescription", { defaultValue: "This will mark the customer as KYC verified and close the active submission." }) : confirmAction?.action === "reject" ? t("kyc.confirm.rejectDescription", { defaultValue: "This will reject the submission and record the selected reason in the review history." }) : t("kyc.confirm.infoDescription", { defaultValue: "This will notify the customer that more information is required before KYC can be completed." })} confirmLabel={confirmAction?.action === "approve" ? t("kyc.confirm.approve", { defaultValue: "Confirm approval" }) : confirmAction?.action === "reject" ? t("kyc.confirm.reject", { defaultValue: "Confirm rejection" }) : t("kyc.confirm.info", { defaultValue: "Send request" })} confirmVariant={confirmAction?.action === "reject" ? "destructive" : "default"} busy={Boolean(confirmAction && reviewing === confirmAction.userId)} onCancel={() => setConfirmAction(null)} onConfirm={() => confirmAction && void review(confirmAction.userId, confirmAction.action, confirmAction.reasonCode, confirmAction.reasonDetail)} />
  </main>;
}

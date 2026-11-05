"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KycSecurityStatus } from "@/lib/kyc/types";
import { Clock3, FileCheck2, Search, ShieldCheck, ChevronLeft, ChevronRight, ArrowRight, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { User } from "@/backend/core/types";
import { KYC_PAGE_SIZES, type KycQueueResult, type KycOperations, type KycReviewCandidate } from "@/lib/kyc/operations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { KycReviewQueueRow } from "@/components/admin/kyc-review-queue-row";
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";
import { useVisibleReviewRefresh } from "@/hooks/use-visible-review-refresh";

function dateLabel(value: string | null | undefined, locale: AppLocale) {
  return value ? new Date(value).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export default function AdminKycPage() {
  const { t, i18n } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const router = useRouter();
  const [security, setSecurity] = useState<KycSecurityStatus | null>(null);
  const [securityError, setSecurityError] = useState(false);
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [queue, setQueue] = useState<KycQueueResult | null>(null);
  const [operations, setOperations] = useState<KycOperations | null>(null);
  const [operationsError, setOperationsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [candidate, setCandidate] = useState<KycReviewCandidate | null>(null);
  const [candidateError, setCandidateError] = useState(false);
  const [candidateLoading, setCandidateLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "info_requested">("all");
  const [assignment, setAssignment] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [refresh, setRefresh] = useState(0);

  const loadQueue = useCallback(async (signal?: AbortSignal) => {
    if (!signal) setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status: statusFilter, assignment, search });
      const response = await fetch(`/api/admin/kyc/submissions?${query}`, { cache: "no-store", signal });
      const body = await response.json().catch(() => ({}));
      if (signal?.aborted) return;
      if (body.error?.code === "KYC_MFA_REQUIRED") { setQueue(null); router.replace("/admin/kyc/mfa?next=%2Fadmin%2Fkyc"); return; }
      if (response.status === 401 || response.status === 403) { setQueue(null); throw Object.assign(new Error(t("reviewRefresh.denied")), { status: response.status }); }
      if (!response.ok || !body.data) throw new Error(t("kyc.errors.loadQueue"));
      setQueue(body.data as KycQueueResult);
      if (body.data.page && body.data.page !== page) setPage(body.data.page);
      setError(null);
    } catch (reason) {
      if (signal) throw reason;
      setError(t("kyc.errors.loadQueue"));
    } finally { if (!signal) setLoading(false); }
  }, [page, pageSize, statusFilter, assignment, search, router, t]);
  const loadCandidate = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/admin/kyc/work", { cache: "no-store", signal });
      const body = await response.json();
      if (signal?.aborted) return;
      if (!response.ok || !body.data) throw new Error("candidate_unavailable");
      setCandidate(body.data.candidate as KycReviewCandidate | null);
      setCandidateError(false);
    } catch {
      if (signal?.aborted) return;
      setCandidate(null);
      setCandidateError(true);
    } finally { if (!signal?.aborted) setCandidateLoading(false); }
  }, []);
  const loadReview = useCallback(async (signal?: AbortSignal) => {
    await Promise.all([loadQueue(signal), loadCandidate(signal)]);
  }, [loadQueue, loadCandidate]);
  const reviewRefresh = useVisibleReviewRefresh({ enabled: true, onRefresh: loadReview });
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadReview(controller.signal).catch(() => setError(t("kyc.errors.loadQueue"))).finally(() => setLoading(false)); }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadReview, t]);

  useEffect(() => {
    const controller = new AbortController();
    async function readStatus() {
      const results = await Promise.allSettled([
        fetch("/api/admin/kyc/security-status", { cache: "no-store", signal: controller.signal }).then(async (response) => {
          const body = await response.json(); if (!response.ok || !body.data) throw new Error(); return body.data as KycSecurityStatus;
        }),
        fetch("/api/admin/kyc/operations", { cache: "no-store", signal: controller.signal }).then(async (response) => {
          const body = await response.json(); if (!response.ok || !body.data) throw new Error(); return body.data as KycOperations;
        }),
      ]);
      if (controller.signal.aborted) return;
      if (results[0].status === "fulfilled") { setSecurity(results[0].value); setSecurityError(false); }
      else setSecurityError(true);
      if (results[1].status === "fulfilled") { setOperations(results[1].value); setOperationsError(false); }
      else { setOperations(null); setOperationsError(true); }
    }
    void readStatus();
    return () => controller.abort();
  }, [refresh]);

  const visibleQueue = queue?.customers ?? [];
  const pendingCount = queue?.counts.pending;
  const infoCount = queue?.counts.infoRequested;
  const oldestPendingAt = queue?.oldestPendingAt;
  const actualPage = queue?.page ?? page;
  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<><ShieldCheck size={18} /> {t("kyc.eyebrow")}</>}
        title={t("kyc.title")}
        actions={<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span role="status">{reviewRefresh.hasRefreshError ? t("reviewRefresh.stale") : t("dashboard.lastRefreshed")} · {reviewRefresh.lastSuccessAt ? new Date(reviewRefresh.lastSuccessAt).toLocaleTimeString() : "—"}</span><Button type="button" size="sm" variant="outline" onClick={() => { reviewRefresh.refresh(); setRefresh((value) => value + 1); }}>{t("actions.refresh")}</Button></div>}
      />
      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <AdminMetricGrid items={[
        { label: t("kyc.metrics.pending"), value: pendingCount ?? "—" },
        { label: t("kyc.metrics.infoRequested"), value: infoCount ?? "—" },
        { label: t("kyc.metrics.verified"), value: queue?.verifiedCount ?? "—" },
        { label: t("kyc.metrics.oldest"), value: oldestPendingAt ? dateLabel(oldestPendingAt, locale) : "—" },
      ]} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold text-foreground">{t("kyc.queue.title")}</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 size={14} /> {t("kyc.queue.oldestFirst")}</div>
        </div>
        {queue && candidate && !candidateError && <div className="mx-5 my-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/15 bg-primary/5 p-4">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{t(candidate.isAssignedToCurrentUser ? "kyc.queue.currentReview" : "kyc.queue.nextApplicant")}</p>
            <p className="truncate font-semibold text-foreground">{candidate.name || t("kyc.queue.unnamedApplicant")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(`kyc.documents.${candidate.docType}`)} · {dateLabel(candidate.submittedAt, locale)}</p>
          </div>
          {/* Detail loading claims this exact submission; prefetch must never claim it early. */}
          <Button asChild>
            <Link prefetch={false} href={`/admin/kyc/${candidate.submissionId}`} aria-label={t(candidate.isAssignedToCurrentUser ? "kyc.queue.continueReviewFor" : "kyc.queue.startReviewFor", { name: candidate.name || t("kyc.queue.unnamedApplicant") })}>
              {t(candidate.isAssignedToCurrentUser ? "kyc.queue.continueReview" : "kyc.queue.startReview")}<ArrowRight size={15} aria-hidden="true" />
            </Link>
          </Button>
        </div>}
        {candidateError && <p role="alert" className="px-5 py-3 text-sm text-destructive">{t("kyc.queue.candidateUnavailable")}</p>}
        {queue && !candidateLoading && !candidate && !candidateError && <p className="px-5 py-3 text-sm text-muted-foreground">{t("kyc.queue.noAvailable")}</p>}
      <AdminFilterBar className="rounded-none border-x-0 border-t-0">
        <label className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input maxLength={200} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); setLoading(true); }} placeholder={t("kyc.filters.search")} aria-label={t("kyc.filters.search")} className={`${adminFilterControlClassName} w-full pl-9`} />
        </label>
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as "all" | "pending" | "info_requested"); setPage(1); setLoading(true); }} aria-label={t("kyc.filters.status")} className={adminFilterControlClassName}>
          <option value="all">{t("kyc.filters.allStatuses")}</option>
          <option value="pending">{t("kyc.status.pending")}</option>
          <option value="info_requested">{t("kyc.filters.infoRequestedCount", { count: infoCount ?? 0 })}</option>
        </select>
        <select aria-label={t("kyc.operations.assignment")} className={adminFilterControlClassName} value={assignment} onChange={(event) => { setAssignment(event.target.value); setPage(1); setLoading(true); }}>
          <option value="all">{t("kyc.operations.allAssignments")}</option><option value="mine">{t("kyc.operations.mine")}</option><option value="unassigned">{t("kyc.operations.unassigned")}</option>
        </select>
        <select aria-label={t("kyc.operations.pageSize")} className={adminFilterControlClassName} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); setLoading(true); }}>
          {KYC_PAGE_SIZES.map((size) => <option value={size} key={size}>{t("kyc.operations.perPage", { count: size })}</option>)}
        </select>
      </AdminFilterBar>

        {loading ? <p role="status" className="p-6 text-sm text-muted-foreground">{t("kyc.detail.loading")}</p> : !queue ? null : visibleQueue.length === 0 ? (
          <EmptyState icon={<FileCheck2 size={28} />} title={t("kyc.empty.title")} description={t("kyc.empty.description")} />
        ) : (
          <div className="divide-y divide-border">
            {visibleQueue.map((user) => {
              const submission = queue?.submissions.find((item) => item.userId === user.id);
              if (!submission) return null;
              return (
                <KycReviewQueueRow
                  key={user.id}
                  user={{ ...user, role: "customer", avatarInitial: user.name.charAt(0).toUpperCase() || "?" } as User}
                  submission={submission}
                  documentLabel={t(`kyc.documents.${submission.docType}`)}
                  statusLabel={t(`kyc.status.${submission.status === "info_requested" ? "infoRequested" : "pending"}`)}
                  submittedLabel={t("kyc.submitted", { date: dateLabel(submission.submittedAt, locale), position: submission.queuePosition ?? "—" })}
                  reviewLabel={t(submission.status === "info_requested" ? "kyc.detail.viewDetails" : "kyc.detail.review")}
                  href={`/admin/kyc/${submission.id}`}
                />
              );
            })}
          </div>
        )}
        {queue && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
          <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            <span>{t("kyc.operations.range", { first: queue.total ? (actualPage - 1) * pageSize + 1 : 0, last: Math.min(actualPage * pageSize, queue.total), total: queue.total })}</span>
            <span>{t("ui.pagination.pageOf", { page: actualPage, total: Math.max(1, queue.totalPages) })}</span>
          </span>
          <div className="flex gap-2"><Button size="sm" variant="outline" aria-label={t("ui.pagination.previousPage")} disabled={loading || actualPage <= 1} onClick={() => { setPage(actualPage - 1); setLoading(true); }}><ChevronLeft size={14} /></Button><Button size="sm" variant="outline" aria-label={t("ui.pagination.nextPage")} disabled={loading || actualPage >= queue.totalPages} onClick={() => { setPage(actualPage + 1); setLoading(true); }}><ChevronRight size={14} /></Button></div>
        </div>}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
      <details className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span>{t("kyc.security.title")}</span>
          <span className="flex items-center gap-2">
            {(securityError || security?.emailRecipients === 0 || (security?.pendingAlerts ?? 0) > 0 || security?.incidents.some((incident) => !incident.resolvedAt)) && <span className="text-xs text-destructive">{t("kyc.queue.securityAttention")}</span>}
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        </summary>
        <p className="text-sm text-muted-foreground">{t("kyc.security.description")}</p>
        {securityError && <p role="alert" className="text-sm text-destructive">{t("kyc.security.unavailable")}</p>}
        {security && <>
          {security.emailRecipients === 0 && <p role="alert" className="text-sm text-destructive">{t("kyc.security.noEmailRecipients")}</p>}
          <p className="text-sm">{t("kyc.security.run", { status: t(`kyc.security.status.${security.latestRun?.status ?? "none"}`) })}</p>
          {security.latestRun && <p className="text-sm text-muted-foreground">{t("kyc.security.counts", { claimed: security.latestRun.claimed, purged: security.latestRun.purged, failed: security.latestRun.failed })} · {new Date(security.latestRun.startedAt).toLocaleString(locale)}</p>}
          <p className="text-sm text-muted-foreground">{t("kyc.security.checked", { time: security.monitor.lastCheckedAt ? new Date(security.monitor.lastCheckedAt).toLocaleString(locale) : t("kyc.security.notChecked") })}</p>
          {security.pendingAlerts > 0 && <p role="alert" className="text-sm text-destructive">{t("kyc.security.pending", { count: security.pendingAlerts })}</p>}
          {security.incidents.length > 0 && <ul className="space-y-2 border-t border-border pt-3">
            {security.incidents.map((incident, index) => <li key={`${incident.occurredAt}-${index}`} className="text-sm">
              <p>{tCommon(`notifications.events.kycSecurity.${incident.kind}`, { count: incident.count })}</p>
              <p className="text-xs text-muted-foreground">{new Date(incident.occurredAt).toLocaleString(locale)} · {t(incident.deliveryQueued ? "kyc.security.queued" : "kyc.security.notQueued")}{incident.resolvedAt ? ` · ${t("kyc.security.resolved")}` : ""}</p>
            </li>)}
          </ul>}
        </>}
      </details>

      {operationsError && <p role="alert" className="text-sm text-destructive">{t("kyc.operations.unavailable")}</p>}
      {operations && <details className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span>{t("kyc.operations.title")}</span><ChevronDown size={16} aria-hidden="true" /></summary>
        <AdminMetricGrid items={[
          { label: t("kyc.operations.submitted"), value: operations.submittedToday },
          { label: t("kyc.operations.decided"), value: operations.decidedToday },
          { label: t("kyc.operations.assigned"), value: operations.assigned },
          { label: t("kyc.operations.waitP95"), value: operations.waitingP95Seconds === null ? "—" : `${Math.round(operations.waitingP95Seconds / 60)}` },
        ]} />
        <p className="text-sm text-muted-foreground">{t("kyc.operations.intervalMeans", { first: operations.sessions.firstReviewMeanSeconds === null ? "—" : Math.round(operations.sessions.firstReviewMeanSeconds), repeat: operations.sessions.reReviewMeanSeconds === null ? "—" : Math.round(operations.sessions.reReviewMeanSeconds) })}</p>
        <p className="text-sm text-muted-foreground">{t("kyc.operations.worker", operations.precheck)}</p>
        {!operations.privateOcrConfigured && <p role="status" className="text-sm text-muted-foreground">{t("kyc.operations.notConfigured")}</p>}
        <p className="text-sm text-muted-foreground">{t("kyc.operations.sessions", { count: operations.sessions.closed, minutes: Math.round(operations.sessions.recordedSeconds / 60), incomplete: operations.sessions.incomplete })}</p>
        <p className="text-xs text-muted-foreground">{t("kyc.operations.measurementNote")}</p>
      </details>}

      </div>
    </AdminPageShell>
  );
}

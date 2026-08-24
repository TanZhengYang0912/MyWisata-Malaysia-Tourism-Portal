"use client";

import { useEffect, useState } from "react";
import { Clock3, FileCheck2, Search, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AdminKycSubmission, User } from "@/backend/core/types";
import { getUsers } from "@/backend/domains/identity";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { KycReviewQueueRow } from "@/components/admin/kyc-review-queue-row";
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";

function dateLabel(value: string | null | undefined, locale: AppLocale) {
  return value ? new Date(value).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export default function AdminKycPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [users, setUsers] = useState<User[]>([]);
  const [submissions, setSubmissions] = useState<Map<string, AdminKycSubmission>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "info_requested">("all");

  async function load() {
    try {
      const [allUsers, response] = await Promise.all([
        getUsers(),
        fetch("/api/admin/kyc/submissions", { cache: "no-store" }),
      ]);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t("kyc.errors.loadSubmissions"));
      setUsers(allUsers.filter((user) => user.role === "customer"));
      setSubmissions(new Map((body.data?.submissions ?? []).map((submission: AdminKycSubmission) => [submission.userId, submission])));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("kyc.errors.loadQueue"));
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const queueUsers = users.filter((user) => submissions.has(user.id));
  const pendingReview = queueUsers.filter((user) => submissions.get(user.id)?.status === "pending");
  const infoRequested = queueUsers.filter((user) => submissions.get(user.id)?.status === "info_requested");
  const verifiedUsers = users.filter((user) => user.verificationTier === "kyc_verified");
  const oldestPendingAt = pendingReview
    .map((user) => submissions.get(user.id)?.submittedAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0];
  const visibleQueue = queueUsers.filter((user) => {
    const submission = submissions.get(user.id);
    const matchesStatus = statusFilter === "all" || submission?.status === statusFilter;
    const searchText = `${user.name} ${user.email} ${submission?.docType ?? ""}`.toLowerCase();
    return matchesStatus && (!search.trim() || searchText.includes(search.trim().toLowerCase()));
  });
  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<><ShieldCheck size={18} /> {t("kyc.eyebrow")}</>}
        title={t("kyc.title")}
        description={t("kyc.description")}
      />
      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <AdminMetricGrid items={[
        { label: t("kyc.metrics.pending"), value: pendingReview.length, detail: t("kyc.metrics.pendingNote") },
        { label: t("kyc.metrics.infoRequested"), value: infoRequested.length, detail: t("kyc.metrics.infoRequestedNote") },
        { label: t("kyc.metrics.verified"), value: verifiedUsers.length, detail: t("kyc.metrics.verifiedNote") },
        { label: t("kyc.metrics.oldest"), value: oldestPendingAt ? dateLabel(oldestPendingAt, locale) : "—", detail: oldestPendingAt ? t("kyc.metrics.submittedFirst") : t("kyc.metrics.queueClear") },
      ]} />

      <AdminFilterBar>
        <label className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("kyc.filters.search")} aria-label={t("kyc.filters.search")} className={`${adminFilterControlClassName} w-full pl-9`} />
        </label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "pending" | "info_requested")} aria-label={t("kyc.filters.status")} className={adminFilterControlClassName}>
          <option value="all">{t("kyc.filters.allStatuses")}</option>
          <option value="pending">{t("kyc.status.pending")}</option>
          <option value="info_requested">{t("kyc.filters.infoRequestedCount", { count: infoRequested.length })}</option>
        </select>
      </AdminFilterBar>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold text-foreground">{t("kyc.queue.title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("kyc.queue.description")}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 size={14} /> {t("kyc.queue.oldestFirst")}</div>
        </div>
        {visibleQueue.length === 0 ? (
          <EmptyState icon={<FileCheck2 size={28} />} title={t("kyc.empty.title")} description={t("kyc.empty.description")} />
        ) : (
          <div className="divide-y divide-border">
            {visibleQueue.map((user) => {
              const submission = submissions.get(user.id);
              if (!submission) return null;
              return (
                <KycReviewQueueRow
                  key={user.id}
                  user={user}
                  submission={submission}
                  documentLabel={t(`kyc.documents.${submission.docType}`)}
                  statusLabel={t(`kyc.status.${submission.status === "info_requested" ? "infoRequested" : "pending"}`)}
                  submittedLabel={t("kyc.submitted", { date: dateLabel(submission.submittedAt, locale), position: submission.queuePosition ?? "—" })}
                  reviewLabel={t("kyc.detail.review")}
                  href={`/admin/kyc/${submission.id}`}
                />
              );
            })}
          </div>
        )}
      </section>

    </AdminPageShell>
  );
}

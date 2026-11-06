"use client";

import Link from "next/link";
import { AlertCircle, ArrowUpRight, Banknote, CheckCircle2, Clock3, Database, Gem, Package, RefreshCw, Shield, TimerReset, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { formatMYR } from "@/lib/i18n/format";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { useAdminQueueSummary } from "@/app/admin/admin-queue-summary-context";
import { isUsableQueueCount, totalAvailableQueueItems } from "@/lib/admin/queue-summary";

function formatAge(createdAt: string | null, translate: (key: string, options?: Record<string, unknown>) => string) {
  if (!createdAt) return translate("withdrawals.queue.noOpenRequests");
  const hours = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000));
  if (hours < 1) return translate("withdrawals.age.lessThanHour");
  if (hours < 24) return translate("withdrawals.age.hours", { count: hours });
  return translate("withdrawals.age.daysHours", { days: Math.floor(hours / 24), hours: hours % 24 });
}

export default function AdminDashboardPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { summary, error, refresh } = useAdminQueueSummary();
  const queues = summary?.queues;
  const activity = queues?.withdrawals.activity?.map((entry) => entry.count) ?? [];
  const data = queues ? {
    vendors: queues.vendors.count,
    kyc: queues.kyc.count,
    withdrawals: queues.withdrawals.count,
    pendingPayoutValue: queues.withdrawals.amount,
    overdueWithdrawals: queues.withdrawals.overdueCount,
    dualApproval: queues.withdrawals.dualApprovalCount,
    recs: queues.recommendations.count,
    tickets: queues.support.count,
    activity,
    oldestWithdrawalAt: queues.withdrawals.oldestCreatedAt,
  } : null;
  const availableQueues = queues ? [queues.vendors, queues.kyc, queues.withdrawals, queues.recommendations, queues.support].filter(isUsableQueueCount) : [];
  const totalAttention = availableQueues.length > 0 ? totalAvailableQueueItems(availableQueues) : null;
  const maxActivity = Math.max(...activity, 1);
  const unavailable = t("dashboard.queueUnavailable");
  const actionRows = queues ? [
    { key: "withdrawals", title: t("dashboard.lanes.withdrawals.title"), queue: queues.withdrawals, detail: queues.withdrawals.amount === null ? unavailable : t("dashboard.lanes.withdrawals.detail", { amount: formatMYR(queues.withdrawals.amount, locale) }), href: "/admin/withdrawals", cta: t("dashboard.lanes.withdrawals.cta"), icon: Banknote, tone: "amber" },
    { key: "kyc", title: t("dashboard.lanes.kyc.title"), queue: queues.kyc, detail: t("dashboard.lanes.kyc.detail"), href: "/admin/kyc", cta: t("dashboard.lanes.kyc.cta"), icon: Shield, tone: "blue" },
    { key: "support", title: t("dashboard.lanes.support.title"), queue: queues.support, detail: t("dashboard.lanes.support.detail"), href: "/admin/support", cta: t("dashboard.lanes.support.cta"), icon: AlertCircle, tone: "rose" },
    { key: "vendors", title: t("dashboard.lanes.vendors.title"), queue: queues.vendors, detail: t("dashboard.lanes.vendors.detail"), href: "/admin/vendors?filter=pending", cta: t("dashboard.lanes.vendors.cta"), icon: Package, tone: "blue" },
    { key: "recommendations", title: t("dashboard.lanes.recommendations.title"), queue: queues.recommendations, detail: t("dashboard.lanes.recommendations.detail"), href: "/admin/recommendations", cta: t("dashboard.lanes.recommendations.cta"), icon: Gem, tone: "blue" },
  ].filter((row) => row.queue.availability !== "forbidden") : [];
  const unavailableSources = actionRows.some((row) => row.queue.availability === "unavailable")
    || queues?.withdrawals.availability === "unavailable";

  function countLabel(value: number | null) {
    return value === null ? unavailable : value;
  }

  const refreshedAt = summary ? new Date(summary.asOf) : null;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><Shield size={14} /> {t("dashboard.eyebrow")}</span>}
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={<button type="button" onClick={refresh} className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><RefreshCw size={15} /> {t("dashboard.refresh")}</button>}
      />

        {error && <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200"><AlertCircle size={17} /> {summary ? t("dashboard.staleData") : t("dashboard.errors.load")}</div>}

        {!summary ? <p className="text-sm text-muted-foreground">{error ? t("dashboard.errors.load") : t("dashboard.loading")}</p> : <>
          <section aria-label={t("dashboard.approvalSummary")} className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            {[
              { label: t("dashboard.metrics.needsAttention"), value: countLabel(totalAttention), supporting: t("dashboard.metrics.authorizedQueues"), icon: AlertCircle, accent: "text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10" },
              { label: t("dashboard.metrics.pendingPayout"), value: data?.pendingPayoutValue === null ? unavailable : formatMYR(data?.pendingPayoutValue ?? 0, locale), supporting: t("dashboard.metrics.withdrawalRequests", { count: countLabel(data?.withdrawals ?? null) }), icon: Banknote, accent: "text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10" },
              { label: t("dashboard.metrics.overdue"), value: countLabel(data?.overdueWithdrawals ?? null), supporting: t("dashboard.metrics.reviewTarget"), icon: TimerReset, accent: "text-red-700 dark:text-red-200 bg-red-50 dark:bg-red-500/10" },
              { label: t("dashboard.metrics.dualApproval"), value: countLabel(data?.dualApproval ?? null), supporting: t("dashboard.metrics.twoApprovers"), icon: UsersRound, accent: "text-primary bg-primary/10" },
              { label: t("dashboard.metrics.openSupport"), value: countLabel(data?.tickets ?? null), supporting: t("dashboard.metrics.openConversations"), icon: AlertCircle, accent: "text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-500/10" },
            ].map((metric) => (
              <div key={metric.label} className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[0_1px_10px_rgba(1,0,102,0.07)]">
                <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${metric.accent}`}><metric.icon size={18} /></div>
                <p className="mt-4 text-3xl font-bold tracking-[-0.05em] text-foreground">{metric.value}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{metric.label}</p>
                <p className="mt-1 text-xs font-medium leading-4 text-muted-foreground">{metric.supporting}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.45fr_0.9fr_0.8fr]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_10px_rgba(1,0,102,0.07)]">
              <div className="flex items-start justify-between border-b border-border px-5 py-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{t("dashboard.priorityLanes")}</p><h2 className="mt-1 text-lg font-bold text-foreground">{t("dashboard.actionCentre")}</h2></div><span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{t("dashboard.openItems", { count: totalAttention })}</span></div>
              <div className="divide-y divide-border">
                {actionRows.map((row) => <Link key={row.key} href={row.href} className="group flex items-center gap-3 px-5 py-4 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${row.tone === "amber" ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-200" : row.tone === "rose" ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-200" : row.tone === "blue" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}><row.icon size={17} /></div>
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold text-foreground">{row.title}</p>{(!isUsableQueueCount(row.queue) || row.queue.count > 0) && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground">{countLabel(row.queue.count)}</span>}</div><p className="mt-1 truncate text-xs text-muted-foreground">{row.queue.availability === "unavailable" ? unavailable : row.detail}</p></div>
                  <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-primary sm:inline-flex">{row.cta} <ArrowUpRight size={14} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span>
                </Link>)}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_10px_rgba(1,0,102,0.07)]">
              <div className="flex items-start justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{t("dashboard.lastSevenDays")}</p><h2 className="mt-1 text-lg font-bold text-foreground">{t("dashboard.queueActivity")}</h2></div><Clock3 size={18} className="text-muted-foreground" /></div>
              <div className="mt-7 flex h-36 items-end gap-2 border-b border-border pb-0">
                {activity.map((value, index) => <div key={`${value}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-semibold text-muted-foreground">{value || ""}</span><div className="w-full max-w-8 rounded-t-lg bg-primary transition-all" style={{ height: `${Math.max(value > 0 ? 14 : 4, (value / maxActivity) * 100)}%`, opacity: value > 0 ? 0.9 : 0.18 }} /></div>)}
              </div>
              <div className="mt-3 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><span>{t("dashboard.sixDaysAgo")}</span><span>{t("dashboard.today")}</span></div>
              <p className="mt-5 rounded-xl bg-muted/60 px-3 py-2.5 text-xs leading-5 text-muted-foreground">{t("dashboard.activityNote")}</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_10px_rgba(1,0,102,0.07)]">
              <div className="flex items-start justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{t("dashboard.guardrails")}</p><h2 className="mt-1 text-lg font-bold text-foreground">{t("dashboard.queueHealth")}</h2></div><Database size={18} className="text-primary" /></div>
              <div className="mt-6 space-y-4"><div className="flex items-start gap-3"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300" /><div><p className="text-sm font-semibold text-foreground">{t("dashboard.allSources")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{unavailableSources ? unavailable : t("dashboard.sourcesLoaded")}</p></div></div><div className="flex items-start gap-3"><Clock3 size={17} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" /><div><p className="text-sm font-semibold text-foreground">{t("dashboard.oldestWithdrawal")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{queues?.withdrawals.availability === "available" ? `${formatAge(data?.oldestWithdrawalAt ?? null, t)} · ${t("dashboard.reviewOldest")}` : unavailable}</p></div></div></div>
              <div className="mt-7 border-t border-border pt-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("dashboard.lastRefreshed")}</p><p className="mt-1 text-sm font-semibold text-foreground">{refreshedAt?.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">{t("dashboard.liveWorkspace")}</p></div>
            </div>
          </section>

          {queues && queues.withdrawals.availability !== "forbidden" && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-primary/[0.04] px-5 py-4 text-sm"><div><span className="font-semibold text-foreground">{t("dashboard.walletShortcut")}</span><span className="ml-2 text-muted-foreground">{data?.withdrawals === null || data?.pendingPayoutValue === null ? unavailable : data && data.withdrawals > 0 ? t("dashboard.walletPending", { count: data.withdrawals, amount: formatMYR(data.pendingPayoutValue, locale) }) : t("dashboard.walletClear")}</span></div><Link href="/admin/withdrawals" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">{t("dashboard.openApprovals")} <ArrowUpRight size={15} /></Link></div>}
        </>}
    </AdminPageShell>
  );
}

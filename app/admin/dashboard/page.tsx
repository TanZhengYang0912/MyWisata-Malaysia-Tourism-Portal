"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowUpRight, Banknote, CheckCircle2, Clock3, Database, Gem, Package, RefreshCw, Shield, TimerReset, UsersRound } from "lucide-react";
import { getOutlets } from "@/backend/domains/catalogue";
import { getUsers, getSupportTickets } from "@/backend/domains/identity";
import { getWithdrawals } from "@/backend/domains/commerce";
import { getVendorRecommendations } from "@/backend/domains/discovery";
import { isWithdrawalReviewableStatus } from "@/lib/wallet/withdrawal-display";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { formatMYR } from "@/lib/i18n/format";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";

type DashboardData = {
  vendors: number;
  kyc: number;
  withdrawals: number;
  pendingPayoutValue: number;
  overdueWithdrawals: number;
  dualApproval: number;
  recs: number;
  tickets: number;
  activity: number[];
  oldestWithdrawalAt: string | null;
};

function formatAge(createdAt: string | null, translate: (key: string, options?: Record<string, unknown>) => string) {
  if (!createdAt) return translate("dashboard.age.noOpenRequests");
  const hours = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000));
  if (hours < 1) return translate("dashboard.age.lessThanHour");
  if (hours < 24) return translate("dashboard.age.hours", { count: hours });
  return translate("dashboard.age.days", { days: Math.floor(hours / 24), hours: hours % 24 });
}

function getLastSevenDays(withdrawalDates: string[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);
    return withdrawalDates.filter((createdAt) => {
      const value = new Date(createdAt).getTime();
      return value >= date.getTime() && value < nextDate.getTime();
    }).length;
  });
}

export default function AdminDashboardPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  async function loadDashboard() {
    setLoadError("");
    try {
      const [outlets, users, withdrawals, recs, tickets] = await Promise.all([
        getOutlets(),
        getUsers(),
        getWithdrawals(),
        getVendorRecommendations(),
        getSupportTickets(),
      ]);
      const reviewable = withdrawals.filter((withdrawal) => isWithdrawalReviewableStatus(withdrawal.status));
      const oldestWithdrawal = reviewable.reduce<string | null>((oldest, withdrawal) => {
        if (!oldest || new Date(withdrawal.createdAt).getTime() < new Date(oldest).getTime()) return withdrawal.createdAt;
        return oldest;
      }, null);
      setData({
        vendors: outlets.filter((outlet) => !outlet.verified).length,
        kyc: users.filter((user) => user.role === "customer" && user.verificationTier !== "kyc_verified").length,
        withdrawals: reviewable.length,
        pendingPayoutValue: reviewable.reduce((sum, withdrawal) => sum + withdrawal.amount, 0),
        overdueWithdrawals: reviewable.filter((withdrawal) => withdrawal.status === "overdue").length,
        dualApproval: reviewable.filter((withdrawal) => withdrawal.requiresDualApproval).length,
        recs: recs.filter((recommendation) => recommendation.status === "pending").length,
        tickets: tickets.filter((ticket) => ticket.status === "open").length,
        activity: getLastSevenDays(withdrawals.map((withdrawal) => withdrawal.createdAt)),
        oldestWithdrawalAt: oldestWithdrawal,
      });
      setRefreshedAt(new Date());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t("dashboard.errors.load"));
    }
  }

  useEffect(() => {
    queueMicrotask(() => { void loadDashboard(); });
  }, []);

  const totalAttention = useMemo(() => data ? data.vendors + data.kyc + data.withdrawals + data.recs + data.tickets : 0, [data]);
  const maxActivity = Math.max(...(data?.activity ?? [0]), 1);

  const actionRows = data ? [
    { title: t("dashboard.lanes.withdrawals.title"), count: data.withdrawals, detail: t("dashboard.lanes.withdrawals.detail", { amount: formatMYR(data.pendingPayoutValue, locale) }), href: "/admin/withdrawals", cta: t("dashboard.lanes.withdrawals.cta"), icon: Banknote, tone: data.withdrawals > 0 ? "amber" : "quiet" },
    { title: t("dashboard.lanes.kyc.title"), count: data.kyc, detail: t("dashboard.lanes.kyc.detail"), href: "/admin/kyc", cta: t("dashboard.lanes.kyc.cta"), icon: Shield, tone: data.kyc > 0 ? "blue" : "quiet" },
    { title: t("dashboard.lanes.support.title"), count: data.tickets, detail: t("dashboard.lanes.support.detail"), href: "/admin/support", cta: t("dashboard.lanes.support.cta"), icon: AlertCircle, tone: data.tickets > 0 ? "rose" : "quiet" },
    { title: t("dashboard.lanes.vendors.title"), count: data.vendors, detail: t("dashboard.lanes.vendors.detail"), href: "/admin/vendors", cta: t("dashboard.lanes.vendors.cta"), icon: Package, tone: data.vendors > 0 ? "blue" : "quiet" },
    { title: t("dashboard.lanes.recommendations.title"), count: data.recs, detail: t("dashboard.lanes.recommendations.detail"), href: "/admin/recommendations", cta: t("dashboard.lanes.recommendations.cta"), icon: Gem, tone: data.recs > 0 ? "blue" : "quiet" },
  ] as const : [];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><Shield size={14} /> {t("dashboard.eyebrow")}</span>}
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={<button type="button" onClick={() => void loadDashboard()} className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><RefreshCw size={15} /> {t("dashboard.refresh")}</button>}
      />

        {loadError && <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle size={17} /> {loadError}</div>}

        {!data ? <p className="text-sm text-muted-foreground">{t("dashboard.loading")}</p> : <>
          <section aria-label={t("dashboard.approvalSummary")} className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            {[
              { label: t("dashboard.metrics.needsAttention"), value: totalAttention, supporting: t("dashboard.metrics.fiveQueues"), icon: AlertCircle, accent: "text-amber-700 bg-amber-50" },
              { label: t("dashboard.metrics.pendingPayout"), value: formatMYR(data.pendingPayoutValue, locale), supporting: t("dashboard.metrics.withdrawalRequests", { count: data.withdrawals }), icon: Banknote, accent: "text-amber-700 bg-amber-50" },
              { label: t("dashboard.metrics.overdue"), value: data.overdueWithdrawals, supporting: t("dashboard.metrics.reviewTarget"), icon: TimerReset, accent: "text-red-700 bg-red-50" },
              { label: t("dashboard.metrics.dualApproval"), value: data.dualApproval, supporting: t("dashboard.metrics.twoApprovers"), icon: UsersRound, accent: "text-primary bg-primary/10" },
              { label: t("dashboard.metrics.openSupport"), value: data.tickets, supporting: t("dashboard.metrics.openConversations"), icon: AlertCircle, accent: "text-rose-700 bg-rose-50" },
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
                {actionRows.map((row) => <Link key={row.title} href={row.href} className="group flex items-center gap-3 px-5 py-4 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${row.tone === "amber" ? "bg-amber-50 text-amber-700" : row.tone === "rose" ? "bg-rose-50 text-rose-700" : row.tone === "blue" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}><row.icon size={17} /></div>
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold text-foreground">{row.title}</p>{row.count > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground">{row.count}</span>}</div><p className="mt-1 truncate text-xs text-muted-foreground">{row.detail}</p></div>
                  <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-primary sm:inline-flex">{row.cta} <ArrowUpRight size={14} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span>
                </Link>)}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_10px_rgba(1,0,102,0.07)]">
              <div className="flex items-start justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{t("dashboard.lastSevenDays")}</p><h2 className="mt-1 text-lg font-bold text-foreground">{t("dashboard.queueActivity")}</h2></div><Clock3 size={18} className="text-muted-foreground" /></div>
              <div className="mt-7 flex h-36 items-end gap-2 border-b border-border pb-0">
                {data.activity.map((value, index) => <div key={`${value}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-semibold text-muted-foreground">{value || ""}</span><div className="w-full max-w-8 rounded-t-lg bg-primary transition-all" style={{ height: `${Math.max(value > 0 ? 14 : 4, (value / maxActivity) * 100)}%`, opacity: value > 0 ? 0.9 : 0.18 }} /></div>)}
              </div>
              <div className="mt-3 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><span>{t("dashboard.sixDaysAgo")}</span><span>{t("dashboard.today")}</span></div>
              <p className="mt-5 rounded-xl bg-muted/60 px-3 py-2.5 text-xs leading-5 text-muted-foreground">{t("dashboard.activityNote")}</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_10px_rgba(1,0,102,0.07)]">
              <div className="flex items-start justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{t("dashboard.guardrails")}</p><h2 className="mt-1 text-lg font-bold text-foreground">{t("dashboard.queueHealth")}</h2></div><Database size={18} className="text-primary" /></div>
              <div className="mt-6 space-y-4"><div className="flex items-start gap-3"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" /><div><p className="text-sm font-semibold text-foreground">{t("dashboard.allSources")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("dashboard.sourcesLoaded")}</p></div></div><div className="flex items-start gap-3"><Clock3 size={17} className="mt-0.5 shrink-0 text-amber-600" /><div><p className="text-sm font-semibold text-foreground">{t("dashboard.oldestWithdrawal")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{formatAge(data.oldestWithdrawalAt, t)} · {t("dashboard.reviewOldest")}</p></div></div></div>
              <div className="mt-7 border-t border-border pt-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("dashboard.lastRefreshed")}</p><p className="mt-1 text-sm font-semibold text-foreground">{refreshedAt?.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">{t("dashboard.liveWorkspace")}</p></div>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-primary/[0.04] px-5 py-4 text-sm"><div><span className="font-semibold text-foreground">{t("dashboard.walletShortcut")}</span><span className="ml-2 text-muted-foreground">{data.withdrawals > 0 ? t("dashboard.walletPending", { count: data.withdrawals, amount: formatMYR(data.pendingPayoutValue, locale) }) : t("dashboard.walletClear")}</span></div><Link href="/admin/withdrawals" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">{t("dashboard.openApprovals")} <ArrowUpRight size={15} /></Link></div>
        </>}
    </AdminPageShell>
  );
}

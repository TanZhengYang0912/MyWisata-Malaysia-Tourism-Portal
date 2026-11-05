"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useAppDialog } from "@/components/providers/app-dialog";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { formatMYR } from "@/lib/i18n/format";

import { useVisibleReviewRefresh } from "@/hooks/use-visible-review-refresh";

type RefundRow = {
  id: string;
  orderId: string;
  orderNumber: string | null;
  amountRm: number;
  reason: string | null;
  reasonCode: string | null;
  evidence: { version: string; items: { name: string; quantity: number; status: string; collectedAt: string | null; venue: string | null; pickupDate: string | null; pickupWindow: string | null; vendor: string | null; scannedBy: string | null }[] };
  status: string;
  provider: string | null;
  method: string | null;
  providerRefundId: string | null;
  manualReference: string | null;
  walletTopupSen: number;
  walletEarningsSen: number;
  externalAmountSen: number;
  failureCode: string | null;
  failureMessage: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
};

const PAGE_SIZES = [15, 25, 50] as const;
const STATUS_OPTIONS = [
  "pending",
  "approved",
  "processed",
  "rejected",
  "failed",
] as const;
const SIMULATOR_PROVIDERS = new Set([
  "tng_ewallet_simulator",
  "grabpay_simulator",
  "bank_transfer_simulator",
]);

function providerLabel(
  provider: string | null,
  t: (key: string, options?: { ns?: string }) => string,
) {
  if (provider === "tng_ewallet_simulator")
    return t("refunds.providers.tngSimulator", { ns: "admin" });
  if (provider === "grabpay_simulator")
    return t("refunds.providers.grabpaySimulator", { ns: "admin" });
  if (provider === "bank_transfer_simulator")
    return t("refunds.providers.bankTransferSimulator", { ns: "admin" });
  if (provider === "stripe")
    return t("refunds.providers.stripeSandbox", { ns: "admin" });
  if (provider === "platform_wallet")
    return t("refunds.providers.mylawatanWallet", { ns: "admin" });
  return provider ?? t("refunds.providers.unknown", { ns: "admin" });
}

export default function AdminRefundsPage() {
  const { t, i18n } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const { prompt } = useAppDialog();
  const locale = isAppLocale(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : DEFAULT_LOCALE;
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(15);
  const [referenceNow, setReferenceNow] = useState<number | null>(null);

  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({ pendingCount: 0, pendingValue: 0, processedCount: 0, failedCount: 0 });

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!signal) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search });
      if (status) params.set("status",status);
      const response = await fetch(`/api/admin/refunds?${params}`, { cache: "no-store", signal });
      if (response.status === 401 || response.status === 403) { setRefunds([]); throw Object.assign(new Error(t("reviewRefresh.denied")), { status: response.status }); }
      if (response.status === 403 || response.status === 401) setRefunds([]);
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          body.error?.message ?? t("refunds.errors.loadRequests"),
        );
      setRefunds(body.data?.refunds ?? []);
      setTotal(body.data?.total ?? 0);
      setTotalPages(Math.max(1,body.data?.totalPages ?? 0));
      setSummary(body.data?.summary ?? { pendingCount: 0, pendingValue: 0, processedCount: 0, failedCount: 0 });
      if (body.data?.page && body.data.page !== page) setPage(body.data.page);
      setReferenceNow(new Date().getTime());
    } catch (loadError) {
      if (signal) throw loadError;
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("refunds.errors.loadRequests"),
      );
    } finally {
      if (!signal) setLoading(false);
    }
  }, [t, page, pageSize, search, status]);

  useEffect(() => {
    // Initial loading is already active; this effect starts the request and the later result updates the view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const reviewRefresh = useVisibleReviewRefresh({ enabled: true, onRefresh: load });
  const visibleRefunds = refunds;
  const visiblePendingValue = summary.pendingValue;
  const processedCount = summary.processedCount;
  const failedCount = summary.failedCount;

  function formatAge(createdAt: string) {
    const createdAtTime = new Date(createdAt).getTime();
    const elapsedHours = Math.max(
      0,
      Math.floor(((referenceNow ?? createdAtTime) - createdAtTime) / 3_600_000),
    );
    if (elapsedHours < 1) return t("refunds.age.lessThanHour");
    if (elapsedHours < 24)
      return t("refunds.age.hours", { count: elapsedHours });
    const days = Math.floor(elapsedHours / 24);
    return t("refunds.age.daysHours", { days, hours: elapsedHours % 24 });
  }

  function statusLabel(value: string) {
    const knownStatuses = new Set(["approved", "failed", "pending", "processed", "rejected", "simulated"]);
    return t(`refunds.status.${knownStatuses.has(value) ? value : "unknown"}`);
  }

  async function review(refund: RefundRow, action: "approve" | "reject") {
    let note: string | undefined;
    if (action === 'approve' && refund.evidence?.items.some((item) => item.status === 'fulfilled')) {
      note = (await prompt(t('eventOperations.collectedRefundNote')))?.trim();
      if (!note || note.length < 5) return;
    }
    let manualReference: string | undefined;
    if (action === "approve"
      && refund.method !== "wallet"
      && refund.provider !== "stripe"
      && !SIMULATOR_PROVIDERS.has(refund.provider ?? "")) {
      const value = await prompt(t("refunds.manualReferencePrompt"));
      manualReference = value?.trim() || undefined;
      if (!manualReference || manualReference.length < 5) return;
    }
    const refundId = refund.id;
    setBusyId(refundId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/refunds/${refundId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, evidenceVersion: refund.evidence?.version, ...(note ? { note } : {}), ...(manualReference ? { manualReference } : {}) }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) await load();
      if (!response.ok)
        throw new Error(
          body.error?.message ?? t("refunds.errors.reviewFailed"),
        );
      await load();
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : t("refunds.errors.reviewFailed"),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function simulate(refundId: string, outcome: "succeeded" | "failed") {
    setBusyId(refundId);
    setError(null);
    try {
      const response = await fetch(
        `/api/payments/simulator/refunds/${refundId}/action`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ outcome }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          body.error?.message ??
            body.error ??
            t("refunds.errors.simulationFailed"),
        );
      await load();
    } catch (simulationError) {
      setError(
        simulationError instanceof Error
          ? simulationError.message
          : t("refunds.errors.simulationFailed"),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<><RotateCcw size={14} /> {t("refunds.header.eyebrow")}</>}
        title={t("refunds.header.title")}
        actions={<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span role="status">{reviewRefresh.hasRefreshError ? t("reviewRefresh.stale") : t("dashboard.lastRefreshed")} · {referenceNow ? new Date(referenceNow).toLocaleTimeString(locale) : "—"}</span>
          <Button type="button" size="sm" variant="outline" onClick={reviewRefresh.refresh}>
            <RefreshCw size={14} /> {t("actions.refresh")}
          </Button>
        </div>}
      />
        <AdminMetricGrid items={[
            {
              label: t("refunds.metrics.needsAction"),
              value: summary.pendingCount,
            },
            {
              label: t("refunds.metrics.pendingRefundValue"),
              value: formatMYR(visiblePendingValue, locale),
            },
            {
              label: t("refunds.metrics.processed"),
              value: processedCount,
            },
            {
              label: t("refunds.metrics.failed"),
              value: failedCount,
            },
          ]} />
        <section className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-200">
          <strong>{t("refunds.sandbox.label")}</strong>{" "}
          {t("refunds.sandbox.description")}
        </section>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <AdminFilterBar>
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={15}
              className="absolute left-3 top-3 text-muted-foreground"
            />
            <input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder={t("refunds.filters.searchOrderOrProvider")}
              className={`${adminFilterControlClassName} w-full pl-9`}
            />
          </div>
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
            className={adminFilterControlClassName}
          >
            <option value="">{t("refunds.filters.allStatuses")}</option>
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
          <select
            value={pageSize}
            onChange={(event) => {
              setPage(1);
              setPageSize(
                Number(event.target.value) as (typeof PAGE_SIZES)[number],
              );
            }}
            className={adminFilterControlClassName}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {t("refunds.filters.perPage", { count: size })}
              </option>
            ))}
          </select>
        </AdminFilterBar>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_10px_rgba(1,0,102,0.06)]">
        <div className="border-b border-border px-5 py-4">
            <div>
              <h2 className="font-bold text-foreground">
                {t("refunds.queue.title", { count: total })}
              </h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[minmax(240px,1.5fr)_130px_minmax(190px,1.2fr)_110px_110px_150px] items-center gap-4 border-b border-border bg-muted/30 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                <span>{t("refunds.table.request")}</span>
                <span>{t("refunds.table.amount")}</span>
                <span>{t("refunds.table.provider")}</span>
                <span>{t("refunds.table.attempts")}</span>
                <span>{t("refunds.table.age")}</span>
                <span>{t("refunds.table.status")}</span>
              </div>
              {loading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {t("refunds.loading")}
                </div>
              ) : visibleRefunds.length === 0 ? (
                <EmptyState
                  title={
                    search || status
                      ? t("refunds.empty.noMatches")
                      : t("refunds.empty.title")
                  }
                />
              ) : (
                <div className="divide-y divide-border">
                  {visibleRefunds.map((refund) => {
                    const simulated = Boolean(
                      refund.provider &&
                      SIMULATOR_PROVIDERS.has(refund.provider),
                    );
                    const busy = busyId === refund.id;
                    return (
                      <div
                        key={refund.id}
                        className="grid grid-cols-[minmax(240px,1.5fr)_130px_minmax(190px,1.2fr)_110px_110px_150px] items-center gap-4 px-5 py-4 transition hover:bg-muted/40"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                            {refund.orderNumber?.slice(-1) ?? "R"}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {refund.orderNumber ?? refund.orderId}
                            </p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {refund.reason ?? t("refunds.detail.noReason")}
                            </p>
                            {refund.evidence?.items.map((item, index) => (
                              <div key={index} className="mt-2 text-xs text-muted-foreground">
                                <p>{item.quantity} × {item.name} · {item.vendor}</p>
                                <p>{item.venue} · {item.pickupDate} · {item.pickupWindow}</p>
                                <p>{item.status === 'fulfilled' ? t('eventOperations.collected') : t('eventOperations.uncollected')}
                                  {item.collectedAt && ` · ${new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.collectedAt))}`}
                                  {item.scannedBy && ` · ${item.scannedBy}`}</p>
                              </div>
                            ))}
                            {refund.failureCode && (
                              <p className="mt-1 truncate font-[family-name:var(--font-mono)] text-[11px] font-semibold text-destructive">
                                {refund.failureCode}
                              </p>
                            )}
                            {refund.failureMessage && (
                              <p className="mt-1 truncate text-[11px] text-destructive">
                                {refund.failureMessage}
                              </p>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="font-[family-name:var(--font-mono)] text-sm font-bold text-foreground">
                            {formatMYR(refund.amountRm, locale)}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {refund.method ?? "—"}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {t("refunds.fundingSummary", {
                              walletTopup: formatMYR(refund.walletTopupSen / 100, locale),
                              walletEarnings: formatMYR(refund.walletEarningsSen / 100, locale),
                              provider: formatMYR(refund.externalAmountSen / 100, locale),
                            })}
                          </p>
                          {refund.manualReference && (
                            <p className="mt-1 truncate text-[10px] text-muted-foreground">
                              {t("refunds.manualReferenceLabel")}: {refund.manualReference}
                            </p>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {providerLabel(refund.provider, t)}
                          </p>
                          {simulated && (
                            <span className="mt-1 inline-flex rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:text-amber-200">
                              {t("refunds.status.simulated")}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {t("refunds.attempt", { count: refund.attemptCount })}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {formatAge(refund.createdAt)}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {new Date(refund.createdAt).toLocaleDateString(
                              locale,
                            )}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={statusLabel(refund.status)} />
                          {refund.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void review(refund, "reject")}
                              >
                                {t("refunds.actions.reject")}
                              </Button>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void review(refund, "approve")
                                }
                              >
                                {t("refunds.actions.approve")}
                              </Button>
                            </>
                          )}
                          {refund.status === "approved" && simulated && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  void simulate(refund.id, "failed")
                                }
                              >
                                {t("refunds.actions.simulateRetryableFailure")}
                              </Button>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void simulate(refund.id, "succeeded")
                                }
                              >
                                {t("refunds.actions.simulateSuccess")}
                              </Button>
                            </>
                          )}
                          {refund.failureMessage && (
                            <XCircle
                              size={15}
                              aria-label={refund.failureMessage}
                              className="text-destructive"
                            />
                          )}
                          {refund.status === "processed" && (
                            <CheckCircle2
                              size={15}
                              className="text-emerald-600 dark:text-emerald-300"
                            />
                          )}
                          {refund.status === "approved" && !simulated && (
                            <Clock3 size={15} className="text-amber-600 dark:text-amber-300" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <span>{tCommon("pagination.page", { current: page, total: totalPages })}</span>
            {totalPages > 1 && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={tCommon("accessibility.previousPage")}
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ChevronLeft size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={tCommon("accessibility.nextPage")}
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </div>
        </div>
    </AdminPageShell>
  );
}

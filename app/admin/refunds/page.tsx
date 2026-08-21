"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";

type RefundRow = {
  id: string;
  orderId: string;
  orderNumber: string | null;
  amountRm: number;
  reason: string | null;
  status: string;
  provider: string | null;
  method: string | null;
  providerRefundId: string | null;
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

function formatRM(value: number) {
  return `${MYR_CODE} ${value.toFixed(2)}`;
}

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
    return t("refunds.providers.mywisataWallet", { ns: "admin" });
  return provider ?? t("refunds.providers.unknown", { ns: "admin" });
}

export default function AdminRefundsPage() {
  const { t, i18n } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/refunds", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          body.error?.message ?? t("refunds.errors.loadRequests"),
        );
      setRefunds(body.data?.refunds ?? []);
      setReferenceNow(new Date().getTime());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("refunds.errors.loadRequests"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [search, status, pageSize]);

  const filteredRefunds = useMemo(() => {
    const query = search.trim().toLowerCase();
    return refunds.filter((refund) => {
      const matchesStatus = !status || refund.status === status;
      const haystack = [
        refund.orderNumber,
        refund.orderId,
        refund.provider,
        refund.reason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  }, [refunds, search, status]);
  const totalPages = Math.max(1, Math.ceil(filteredRefunds.length / pageSize));
  const visibleRefunds = filteredRefunds.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const visiblePending = filteredRefunds.filter(
    (refund) => refund.status === "pending" || refund.status === "approved",
  );
  const visiblePendingValue = visiblePending.reduce(
    (total, refund) => total + refund.amountRm,
    0,
  );
  const simulatedCount = filteredRefunds.filter(
    (refund) => refund.provider && SIMULATOR_PROVIDERS.has(refund.provider),
  ).length;
  const processedCount = filteredRefunds.filter(
    (refund) => refund.status === "processed",
  ).length;
  const failedCount = filteredRefunds.filter(
    (refund) => refund.status === "failed",
  ).length;
  const oldestRefund = filteredRefunds.reduce<RefundRow | null>(
    (oldest, refund) =>
      !oldest || refund.createdAt < oldest.createdAt ? refund : oldest,
    null,
  );

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
    if (value === "processed") return t("refunds.status.processed");
    return t(`refunds.status.${value}`, { defaultValue: value });
  }

  async function review(refundId: string, action: "approve" | "reject") {
    setBusyId(refundId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/refunds/${refundId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => ({}));
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
          description={t("refunds.header.description")}
          actions={<div className="rounded-xl border border-border bg-card px-4 py-3 text-right shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {t("refunds.header.reviewPriority")}
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {filteredRefunds.length > 0
                ? t("refunds.header.oldestFirst")
                : t("refunds.header.queueClear")}
            </p>
          </div>}
        />
        <AdminMetricGrid items={[
            {
              label: t("refunds.metrics.needsAction"),
              value: visiblePending.length,
              detail: t("refunds.metrics.requestsInQueue"),
            },
            {
              label: t("refunds.metrics.pendingRefundValue"),
              value: formatRM(visiblePendingValue),
              detail: t("refunds.metrics.visiblePageTotal"),
            },
            {
              label: t("refunds.metrics.simulatedProviders"),
              value: simulatedCount,
              detail: t("refunds.metrics.visiblePageTotal"),
            },
            {
              label: t("refunds.metrics.processed"),
              value: processedCount,
              detail: t("refunds.metrics.completed"),
            },
            {
              label: t("refunds.metrics.failed"),
              value: failedCount,
              detail: t("refunds.metrics.needsAttention"),
            },
          ]} />
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
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
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("refunds.filters.searchOrderOrProvider")}
              className={`${adminFilterControlClassName} w-full pl-9`}
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
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
            onChange={(event) =>
              setPageSize(
                Number(event.target.value) as (typeof PAGE_SIZES)[number],
              )
            }
            className={adminFilterControlClassName}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {t("refunds.filters.perPage", { count: size })}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />{" "}
            {t("refunds.actions.refresh")}
          </Button>
        </AdminFilterBar>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_10px_rgba(1,0,102,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-bold text-foreground">
                {t("refunds.queue.title", { count: filteredRefunds.length })}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("refunds.queue.description")}
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {oldestRefund
                ? t("refunds.queue.oldestRequest", {
                    age: formatAge(oldestRefund.createdAt),
                  })
                : t("refunds.queue.noOpenRequests")}
            </span>
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
                  description={
                    search || status
                      ? undefined
                      : t("refunds.empty.description")
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
                            {formatRM(refund.amountRm)}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {refund.method ?? "—"}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {providerLabel(refund.provider, t)}
                          </p>
                          {simulated && (
                            <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
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
                                onClick={() => void review(refund.id, "reject")}
                              >
                                {t("refunds.actions.reject")}
                              </Button>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void review(refund.id, "approve")
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
                              className="text-emerald-600"
                            />
                          )}
                          {refund.status === "approved" && !simulated && (
                            <Clock3 size={15} className="text-amber-600" />
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

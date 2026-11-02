"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WithdrawalRequest } from "@/backend/core/types";
import type { WithdrawalHistoryCursor, WithdrawalHistoryPage } from "@/backend/domains/commerce";
import { StatusBadge } from "@/components/shared/status-badge";
import { ApiErrorNotice } from "@/components/shared/api-error-notice";
import { Button } from "@/components/ui/button";
import { formatMYR } from "@/lib/i18n/format";

type WithdrawalHistoryResult = {
  key: string;
  page: WithdrawalHistoryPage | null;
  failed: boolean;
  requestId?: string;
};

export function WithdrawalList({ pending }: { pending: WithdrawalRequest[] }) {
  const { t, i18n } = useTranslation("customer");
  const locale = i18n.language === "en" ? "en-MY" : i18n.language;
  return <>
    {pending.length > 0 && <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-card"><div className="flex items-center gap-2 border-b border-border px-5 py-4"><Clock size={14} className="text-accent" /><h2 className="text-sm font-bold text-foreground">{t("ui.wallet.inProgress", { count: pending.length })}</h2></div><div className="divide-y divide-border">{pending.map((w) => (
      <Link key={w.id} href={`/customer/wallet/withdrawals/${w.id}`} className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"><div><p className="text-sm font-semibold text-foreground">{w.destination}</p><p className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleDateString(locale)}</p></div><div className="text-right"><p className="font-[family-name:var(--font-mono)] font-bold text-primary">-{formatMYR(w.amount)}</p><StatusBadge status={w.status} /></div></Link>
    ))}</div></section>}
  </>;
}

export function WithdrawalHistory({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation("customer");
  const locale = i18n.language === "en" ? "en-MY" : i18n.language;
  const [cursors, setCursors] = useState<Array<WithdrawalHistoryCursor | null>>([null]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<WithdrawalHistoryResult | null>(null);
  const [knownTotal, setKnownTotal] = useState<{ userId: string; count: number } | null>(null);
  const cursor = cursors[cursors.length - 1];
  const cursorKey = cursor ? `${cursor.createdAt}:${cursor.id}` : "first";
  const requestKey = `${userId}:${cursorKey}:${attempt}`;
  const currentResult = result?.key === requestKey ? result : null;
  const page = currentResult?.page;
  const loading = currentResult === null;
  const total = knownTotal?.userId === userId ? knownTotal.count : null;
  const pages = total === null ? Math.max(1, cursors.length + (page?.hasMore ? 1 : 0)) : Math.max(1, Math.ceil(total / 25));

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const params = new URLSearchParams({ pageSize: "25" });
    if (cursor) {
      params.set("beforeCreatedAt", cursor.createdAt);
      params.set("beforeId", cursor.id);
    }
    fetch(`/api/wallet/withdrawals/history?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json() as {
        data?: WithdrawalHistoryPage;
        error?: { message?: string; requestId?: string };
      };
      if (!response.ok || !body.data) {
        if (active) setResult({ key: requestKey, page: null, failed: true, requestId: body.error?.requestId });
        return;
      }
      if (!active) return;
      setResult({ key: requestKey, page: body.data, failed: false });
      if (!cursor && typeof body.data.totalCount === "number") {
        setKnownTotal({ userId, count: body.data.totalCount });
      }
    }).catch(() => {
      if (active) setResult({ key: requestKey, page: null, failed: true });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [cursor, requestKey, userId]);

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-bold text-foreground">{t("ui.wallet.withdrawalHistory.title")}</h2>
      </div>
      {loading ? (
        <p role="status" className="px-5 py-8 text-center text-sm text-muted-foreground">{t("ui.wallet.withdrawalHistory.loading")}</p>
      ) : currentResult?.failed ? (
        <div role="alert" className="space-y-3 px-5 py-6 text-center text-sm text-muted-foreground">
          <ApiErrorNotice message={t("ui.wallet.withdrawalHistory.error")} requestId={currentResult.requestId} />
          <Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t("ui.wallet.withdrawalHistory.retry")}</Button>
        </div>
      ) : page?.requests.length === 0 ? (
        <p role="status" className="px-5 py-8 text-center text-sm text-muted-foreground">{t("ui.wallet.withdrawalHistory.empty")}</p>
      ) : (
        <div className="divide-y divide-border">
          {page?.requests.map((withdrawal) => (
            <Link key={withdrawal.id} href={`/customer/wallet/withdrawals/${withdrawal.id}`} className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-foreground">{withdrawal.destination || t("ui.wallet.withdrawalHistory.unknownDestination")}</p>
                <p className="text-xs text-muted-foreground">{new Date(withdrawal.createdAt).toLocaleDateString(locale, { timeZone: "Asia/Kuala_Lumpur" })}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-[family-name:var(--font-mono)] font-bold text-primary">-{formatMYR(withdrawal.amount)}</p>
                <StatusBadge status={withdrawal.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
      {!loading && !currentResult?.failed && page && page.requests.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p role="status" className="text-xs text-muted-foreground">
            {t("ui.wallet.withdrawalHistory.page", { page: cursors.length, pages, total: total ?? "—" })}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={cursors.length <= 1} onClick={() => setCursors((current) => current.slice(0, -1))}>
              {t("ui.wallet.withdrawalHistory.previous")}
            </Button>
            <Button type="button" variant="outline" disabled={!page.hasMore || !page.nextCursor} onClick={() => {
              if (page.nextCursor) setCursors((current) => [...current, page.nextCursor]);
            }}>
              {t("ui.wallet.withdrawalHistory.next")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

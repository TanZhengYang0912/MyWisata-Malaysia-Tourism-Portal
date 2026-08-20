"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { Notification, NotificationBellProps } from "./notification-bell";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

export type NotificationCenterProps = Omit<NotificationBellProps, "allHref"> & { pageSize?: number };
type ApiBody = { data?: { items: Notification[]; totalPages: number }; error?: { message?: string } };

function apiErrorMessage(body: ApiBody): string | null {
  const message = body.error?.message;
  return typeof message === "string" && message.trim() ? message : null;
}

const DEFAULT_CATEGORIES = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
];

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  all: "notifications.categories.all",
  wallet: "notifications.categories.wallet",
  bookings_purchases: "notifications.categories.bookings_purchases",
  recommendations_affiliate: "notifications.categories.recommendations_affiliate",
  support: "notifications.categories.support",
  account_security: "notifications.categories.account_security",
  vendor_orders: "notifications.categories.vendor_orders",
  vendor_bookings: "notifications.categories.vendor_bookings",
  vendor_products: "notifications.categories.vendor_products",
  vendor_wallet: "notifications.categories.vendor_wallet",
  vendor_account: "notifications.categories.vendor_account",
};

export function NotificationCenter({ scope = "customer", vendorId = null, categories = DEFAULT_CATEGORIES, pageSize = 15 }: NotificationCenterProps) {
  const { t, i18n } = useTranslation("common");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState<Notification[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const safePageSize = Math.min(50, Math.max(1, pageSize));
  // Unread is a first-class read-state filter rendered below. Do not render a
  // second chip when a caller also includes it in its category list.
  const categoryOptions = categories.filter((option) => option.value !== "unread");

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(safePageSize) });
        if (scope === "vendor") { params.set("scope", "vendor"); if (vendorId) params.set("vendorId", vendorId); }
        if (filter === "unread") params.set("read", "unread");
        else if (filter !== "all") params.set("category", filter);
        const response = await fetch(`/api/notifications?${params}`, { signal: controller.signal });
        const body = await response.json() as ApiBody;
        if (!response.ok || !body.data) {
          setError(apiErrorMessage(body) ?? t("notifications.loadError"));
          return;
        }
        setItems(body.data.items); setTotalPages(body.data.totalPages); setError(null);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") setError(t("notifications.loadError"));
      }
    })();
    return () => controller.abort();
  }, [filter, page, safePageSize, scope, vendorId, t]);

  async function markRead(id: string) {
    const response = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    if (response.ok) setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
  }
  async function markAll() {
    const markAllParams = new URLSearchParams();
    if (scope === "vendor") { markAllParams.set("scope", "vendor"); if (vendorId) markAllParams.set("vendorId", vendorId); }
    const response = await fetch(`/api/notifications/read-all${markAllParams.toString() ? `?${markAllParams}` : ""}`, { method: "POST" });
    if (response.ok) setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
  }

  return <div>
    <div className="mb-5 flex flex-wrap items-center gap-2"><span className="mr-2 text-sm font-semibold text-muted-foreground">{t("filters.filter")}</span>{categoryOptions.map((option) => <button key={option.value} type="button" onClick={() => { setFilter(option.value); setPage(1); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === option.value ? "border-primary bg-primary text-white" : "border-border text-muted-foreground"}`}>{t(option.labelKey ?? CATEGORY_LABEL_KEYS[option.value] ?? option.label)}</button>)}<button type="button" onClick={() => { setFilter("unread"); setPage(1); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === "unread" ? "border-primary bg-primary text-white" : "border-border text-muted-foreground"}`}>{t("notifications.unread")}</button><button type="button" onClick={() => void markAll()} className="ml-auto rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary">{t("notifications.markAllAsRead")}</button></div>
    {error && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
    <div className="rounded-2xl border border-border bg-card">{items.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">{t("notifications.noNotificationsFound")}</p> : items.map((item) => <div key={item.id} className={`border-b border-border px-5 py-4 last:border-0 ${item.readAt ? "" : "bg-primary/5"}`}><button type="button" onClick={() => void markRead(item.id)} className="w-full text-left"><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.body}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.createdAt, locale)}</p></button>{item.link && <Link className="mt-2 inline-block text-xs font-semibold text-primary" href={item.link}>{t("notifications.open")}</Link>}</div>)}</div>
    <div className="mt-4 flex items-center justify-between text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label={t("accessibility.previousPage")} className="rounded-lg border border-border px-3 py-2 disabled:opacity-50">{t("actions.previous")}</button><span aria-live="polite">{t("pagination.page", { current: formatNumber(page, locale), total: formatNumber(totalPages, locale) })}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} aria-label={t("accessibility.nextPage")} className="rounded-lg border border-border px-3 py-2 disabled:opacity-50">{t("actions.next")}</button></div>
  </div>;
}

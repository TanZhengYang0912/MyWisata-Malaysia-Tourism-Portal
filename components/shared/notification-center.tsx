"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Pagination } from "@/components/shared/pagination";
import { useAuth } from "@/components/providers/auth";
import type { Notification, NotificationBellProps } from "./notification-bell";
import { formatDateTime } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { localizeNotification } from "@/lib/notifications/localize";

export type NotificationCenterProps = Omit<NotificationBellProps, "allHref"> & { pageSize?: number };
type ApiBody = { data?: { items: Notification[]; page: number; pageSize: number; total: number; totalPages: number }; error?: { message?: string } };
type LoadedPage = { dataKey: string; items: Notification[]; total: number; totalPages: number };

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
  messages: "notifications.categories.messages",
  withdrawal_approval_task: "notifications.categories.wallet",
  vendor_orders: "notifications.categories.vendor_orders",
  vendor_bookings: "notifications.categories.vendor_bookings",
  vendor_products: "notifications.categories.vendor_products",
  vendor_wallet: "notifications.categories.vendor_wallet",
  vendor_account: "notifications.categories.vendor_account",
};

export function NotificationCenter({ scope = "customer", vendorId = null, categories = DEFAULT_CATEGORIES, pageSize = 15 }: NotificationCenterProps) {
  const { t, i18n } = useTranslation("common");
  const { currentUser } = useAuth();
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const identityKey = `${currentUser?.id ?? "guest"}:${scope}:${scope === "vendor" ? vendorId ?? "" : ""}`;
  const identityRef = useRef(identityKey);
  const [filter, setFilter] = useState("all");
  const [loadedPage, setLoadedPage] = useState<LoadedPage | null>(null);
  const [pageState, setPageState] = useState({ viewKey: "", page: 1 });
  const [error, setError] = useState<{ identityKey: string; message: string } | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const safePageSize = Math.min(50, Math.max(1, pageSize));
  const visibleError = error?.identityKey === identityKey ? error.message : null;
  const pageViewKey = `${identityKey}:${filter}:${safePageSize}`;
  const page = pageState.viewKey === pageViewKey ? pageState.page : 1;
  const dataKey = `${pageViewKey}:${page}`;
  const items = loadedPage?.dataKey === dataKey ? loadedPage.items : [];
  const totalPages = loadedPage?.dataKey === dataKey ? loadedPage.totalPages : 1;
  const total = loadedPage?.dataKey === dataKey ? loadedPage.total : 0;
  // Unread is a first-class read-state filter rendered below. Do not render a
  // second chip when a caller also includes it in its category list.
  const categoryOptions = categories.filter((option) => option.value !== "unread");

  useLayoutEffect(() => {
    identityRef.current = identityKey;
  }, [identityKey]);

  useEffect(() => {
    if (scope !== "staff") return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") setRefreshVersion((version) => version + 1);
    };
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [scope]);

  useEffect(() => {
    const controller = new AbortController();
    const requestIdentity = identityKey;
    const requestDataKey = dataKey;
    (async () => {
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(safePageSize) });
        if (scope === "vendor") { params.set("scope", "vendor"); if (vendorId) params.set("vendorId", vendorId); }
        else if (scope === "staff") params.set("scope", "staff");
        if (filter === "unread") params.set("read", "unread");
        else if (filter !== "all") params.set("category", filter);
        const response = await fetch(`/api/notifications?${params}`, { signal: controller.signal });
        const body = await response.json() as ApiBody;
        if (controller.signal.aborted || identityRef.current !== requestIdentity) return;
        if (!response.ok || !body.data) {
          setError({ identityKey: requestIdentity, message: apiErrorMessage(body) ?? t("notifications.loadError") });
          return;
        }
        const nextPage = Math.max(1, body.data.totalPages);
        if (page > nextPage) {
          setPageState({ viewKey: pageViewKey, page: nextPage });
          return;
        }
        setLoadedPage({ dataKey: requestDataKey, items: body.data.items, total: body.data.total, totalPages: nextPage });
        setError(null);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError" && !controller.signal.aborted && identityRef.current === requestIdentity) {
          setError({ identityKey: requestIdentity, message: t("notifications.loadError") });
        }
      }
    })();
    return () => controller.abort();
  }, [dataKey, filter, identityKey, page, pageViewKey, refreshVersion, safePageSize, scope, vendorId, t]);

  async function markRead(id: string) {
    const requestIdentity = identityKey;
    try {
      const response = await fetch(`/api/notifications/${id}/read?${new URLSearchParams({scope,...(scope === "vendor" && vendorId ? {vendorId} : {})})}`, { method: "PATCH" });
      if (identityRef.current !== requestIdentity) return;
      if (!response.ok) {
        setError({ identityKey: requestIdentity, message: t("notifications.loadError") });
        return;
      }
      setRefreshVersion((version) => version + 1);
    } catch {
      if (identityRef.current === requestIdentity) setError({ identityKey: requestIdentity, message: t("notifications.loadError") });
    }
  }
  async function markAll() {
    const requestIdentity = identityKey;
    const markAllParams = new URLSearchParams();
    if (scope === "vendor") { markAllParams.set("scope", "vendor"); if (vendorId) markAllParams.set("vendorId", vendorId); }
    if (scope === "staff") markAllParams.set("scope", "staff");
    try {
      const response = await fetch(`/api/notifications/read-all${markAllParams.toString() ? `?${markAllParams}` : ""}`, { method: "POST" });
      if (identityRef.current !== requestIdentity) return;
      if (!response.ok) {
        setError({ identityKey: requestIdentity, message: t("notifications.loadError") });
        return;
      }
      setRefreshVersion((version) => version + 1);
    } catch {
      if (identityRef.current === requestIdentity) setError({ identityKey: requestIdentity, message: t("notifications.loadError") });
    }
  }

  return <div>
    <div className="mb-5 flex flex-wrap items-center gap-2"><span className="mr-2 text-sm font-semibold text-muted-foreground">{t("filters.filter")}</span>{categoryOptions.map((option) => <button key={option.value} type="button" onClick={() => setFilter(option.value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === option.value ? "border-primary bg-primary text-white" : "border-border text-muted-foreground"}`}>{t(option.labelKey ?? CATEGORY_LABEL_KEYS[option.value] ?? option.label)}</button>)}<button type="button" onClick={() => setFilter("unread")} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === "unread" ? "border-primary bg-primary text-white" : "border-border text-muted-foreground"}`}>{t("notifications.unread")}</button><button type="button" onClick={() => void markAll()} className="ml-auto rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary">{t("notifications.markAllAsRead")}</button></div>
    {visibleError && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{visibleError}</p>}
    <div className="rounded-2xl border border-border bg-card">{items.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">{t("notifications.noNotificationsFound")}</p> : items.map((item) => {
      const metadata = { ...item.metadata };
      if (typeof metadata.resolved_at === "string") {
        const resolvedTime = Date.parse(metadata.resolved_at);
        if (Number.isFinite(resolvedTime)) metadata.resolved_at_label = formatDateTime(resolvedTime, locale);
      }
      const localized = localizeNotification({ ...item, metadata }, (key, options) => t(key, options));
      return <div key={item.id} className={`border-b border-border px-5 py-4 last:border-0 ${item.readAt ? "" : "bg-primary/5"}`}><button type="button" onClick={() => void markRead(item.id)} className="w-full text-left"><p className="font-semibold">{localized.title}</p><p className="mt-1 text-sm text-muted-foreground">{localized.body}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.createdAt, locale)}</p></button>{item.link && <Link className="mt-2 inline-block text-xs font-semibold text-primary" href={item.link}>{t("notifications.open")}</Link>}</div>;
    })}</div>
    <Pagination currentPage={page} totalPages={totalPages} totalItems={total} pageSize={safePageSize} onPageChange={(next) => setPageState({ viewKey: pageViewKey, page: next })} />
  </div>;
}

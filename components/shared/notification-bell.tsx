"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth";
import { HEADER_ICON_BUTTON_CLASS } from "@/components/shared/header-icon-button";
import { formatDateTime } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { notificationPollDelay } from "@/lib/notifications/polling";
import { localizeNotification } from "@/lib/notifications/localize";
import { useViewportClampedPopoverPosition } from "@/components/shared/use-viewport-clamped-popover-position";

export type NotificationScope = "customer" | "vendor" | "staff";
export type NotificationCategoryOption = { value: string; label: string; labelKey?: string };
export type NotificationBellProps = {
  scope?: NotificationScope;
  vendorId?: string | null;
  allHref?: string;
  categories?: ReadonlyArray<NotificationCategoryOption>;
};
export type Notification = { id: string; type?: string; title: string; body: string; metadata?: Record<string, unknown>; link: string | null; category: string; readAt: string | null; createdAt: string };
type ApiBody = { data?: { items: Notification[]; total: number }; error?: { message?: string } };

const CUSTOMER_CATEGORIES: NotificationCategoryOption[] = [
  { value: "all", label: "All" },
  { value: "wallet", label: "Wallet" },
  { value: "bookings_purchases", label: "Bookings & Purchases" },
  { value: "recommendations_affiliate", label: "Recommendations & Affiliate" },
  { value: "support", label: "Support" },
  { value: "account_security", label: "Account & Security" },
];

const VENDOR_CATEGORIES: NotificationCategoryOption[] = [
  { value: "all", label: "All" },
  { value: "vendor_orders", label: "Orders" },
  { value: "vendor_bookings", label: "Bookings" },
  { value: "vendor_products", label: "Products" },
  { value: "vendor_wallet", label: "Wallet" },
  { value: "vendor_account", label: "Account" },
];

const STAFF_CATEGORIES: NotificationCategoryOption[] = [
  { value: "all", label: "All" },
  { value: "wallet", label: "Wallet" },
  { value: "support", label: "Support" },
  { value: "account_security", label: "Account & Security" },
  { value: "messages", label: "Messages" },
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

function paramsFor(props: NotificationBellProps, category = "all", read = "all", pageSize = 15, page = 1, countOnly = false) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (countOnly) params.set("countOnly", "1");
  if (props.scope === "vendor") {
    params.set("scope", "vendor");
    if (props.vendorId) params.set("vendorId", props.vendorId);
  } else if (props.scope === "staff") params.set("scope", "staff");
  if (category !== "all") params.set("category", category);
  if (read !== "all") params.set("read", read);
  return params;
}

export function NotificationBell({ scope = "customer", vendorId = null, allHref, categories }: NotificationBellProps) {
  const props = { scope, vendorId, allHref: allHref ?? (scope === "staff" ? "/admin/notifications" : "/customer/notifications"), categories: categories ?? (scope === "vendor" ? VENDOR_CATEGORIES : scope === "staff" ? STAFF_CATEGORIES : CUSTOMER_CATEGORIES) };
  const { t, i18n } = useTranslation("common");
  const { currentUser } = useAuth();
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const identityKey = `${currentUser?.id ?? "guest"}:${scope}:${scope === "vendor" ? vendorId ?? "" : ""}`;
  const identityRef = useRef(identityKey);
  useLayoutEffect(() => {
    identityRef.current = identityKey;
  }, [identityKey]);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [feedIdentityKey, setFeedIdentityKey] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [unreadIdentityKey, setUnreadIdentityKey] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState(2);
  const [loadingMore, setLoadingMore] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const popoverPosition = useViewportClampedPopoverPosition(open, triggerRef, panelRef);
  const visibleItems = feedIdentityKey === identityKey ? items : [];
  const visibleUnread = unreadIdentityKey === identityKey ? unread : 0;
  const visibleTotal = feedIdentityKey === identityKey ? total : 0;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let consecutiveFailures = 0;
    let timer: number | null = null;
    const requestIdentity = identityKey;
    async function refreshUnread() {
      if (cancelled) return;
      if (document.visibilityState !== "visible" || inFlight) {
        scheduleNext();
        return;
      }
      inFlight = true;
      let succeeded = false;
      try {
        const response = await fetch(`/api/notifications?${paramsFor({ scope, vendorId }, "all", "unread", 1, 1, true)}`);
        const body = await response.json() as ApiBody;
        if (!cancelled && identityRef.current === requestIdentity && response.ok && body.data) {
          setUnread(body.data.total);
          setUnreadIdentityKey(requestIdentity);
          succeeded = true;
        }
      } catch {
        // Keep the last known badge count when the poll is temporarily unavailable.
      } finally {
        inFlight = false;
        consecutiveFailures = succeeded ? 0 : Math.min(consecutiveFailures + 1, 10);
        scheduleNext();
      }
    }
    function scheduleNext() {
      if (cancelled) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void refreshUnread(), notificationPollDelay(30_000, consecutiveFailures));
    }
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refreshUnread();
    }
    void refreshUnread();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [identityKey, scope, vendorId]);
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let consecutiveFailures = 0;
    let timer: number | null = null;
    const requestIdentity = identityKey;
    async function refreshFeed() {
      if (!open || cancelled) return;
      if (document.visibilityState !== "visible" || inFlight) {
        scheduleNext();
        return;
      }
      inFlight = true;
      let succeeded = false;
      try {
        const response = await fetch(`/api/notifications?${paramsFor({ scope, vendorId }, category, readFilter)}`);
        const body = await response.json() as ApiBody;
        if (!cancelled && identityRef.current === requestIdentity && response.ok && body.data) {
          setItems(body.data.items);
          setFeedIdentityKey(requestIdentity);
          setTotal(body.data.total);
          setNextPage(2);
          succeeded = true;
        }
      } catch {
        // Keep the last loaded notification feed when the request is unavailable.
      } finally {
        inFlight = false;
        consecutiveFailures = succeeded ? 0 : Math.min(consecutiveFailures + 1, 10);
        scheduleNext();
      }
    }
    function scheduleNext() {
      if (cancelled || !open) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void refreshFeed(), notificationPollDelay(30_000, consecutiveFailures));
    }
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refreshFeed();
    }
    if (open) void refreshFeed();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [identityKey, open, scope, vendorId, category, readFilter]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  async function markRead(id: string) {
    const requestIdentity = identityKey;
    const response = await fetch(`/api/notifications/${id}/read?${new URLSearchParams({scope,...(scope === "vendor" && vendorId ? {vendorId} : {})})}`, { method: "PATCH" });
    if (!response.ok || identityRef.current !== requestIdentity) return;
    setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    setFeedIdentityKey(requestIdentity);
    setUnread((current) => Math.max(0, current - 1));
    setUnreadIdentityKey(requestIdentity);
  }
  async function markAll() {
    const requestIdentity = identityKey;
    const markAllParams = new URLSearchParams();
    if (scope === "vendor") { markAllParams.set("scope", "vendor"); if (vendorId) markAllParams.set("vendorId", vendorId); }
    if (scope === "staff") markAllParams.set("scope", "staff");
    const response = await fetch(`/api/notifications/read-all${markAllParams.toString() ? `?${markAllParams}` : ""}`, { method: "POST" });
    if (!response.ok || identityRef.current !== requestIdentity) return;
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setFeedIdentityKey(requestIdentity);
    setUnread(0);
    setUnreadIdentityKey(requestIdentity);
  }
  async function loadMore() {
    if (loadingMore || visibleItems.length >= visibleTotal) return;
    setLoadingMore(true);
    const page = nextPage;
    const requestIdentity = identityKey;
    try {
      const response = await fetch(`/api/notifications?${paramsFor(props, category, readFilter, 15, page)}`);
      const body = await response.json() as ApiBody;
      if (identityRef.current === requestIdentity && response.ok && body.data) {
        setItems((current) => {
          const knownIds = new Set(current.map((item) => item.id));
          return [...current, ...body.data!.items.filter((item) => !knownIds.has(item.id))];
        });
        setFeedIdentityKey(requestIdentity);
        setTotal(body.data.total);
        setNextPage(page + 1);
      }
    } catch {
      // The existing notifications remain available if the next page cannot load.
    } finally {
      if (identityRef.current === requestIdentity) setLoadingMore(false);
    }
  }
  return <div ref={ref} className="relative shrink-0">
    <button ref={triggerRef} type="button" aria-label={t("accessibility.notifications")} aria-expanded={open} onClick={() => setOpen((value) => !value)} className={HEADER_ICON_BUTTON_CLASS}>
      <Bell size={18} />{visibleUnread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[0.5625rem] font-bold leading-4 text-white">{visibleUnread > 99 ? "99+" : visibleUnread}</span>}
    </button>
    {open && <div ref={panelRef} style={popoverPosition ?? { visibility: "hidden" }} className="fixed z-50 w-[min(26rem,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-card shadow-[0_18px_45px_rgba(1,0,102,0.16)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><p className="font-semibold">{t("notifications.title")}</p><button type="button" onClick={() => void markAll()} className="flex items-center gap-1 text-xs text-primary"><CheckCheck size={14} /> {t("notifications.markAllAsRead")}</button></div>
      <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2"><button type="button" onClick={() => { setCategory("all"); setReadFilter("unread"); }} className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold ${readFilter === "unread" ? "border-primary bg-primary text-white" : "border-border text-muted-foreground"}`}>{t("notifications.unread")}</button>{props.categories.filter((option) => option.value !== "unread").map((option) => <button key={option.value} type="button" onClick={() => { setCategory(option.value); setReadFilter("all"); }} className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold ${readFilter === "all" && category === option.value ? "border-primary bg-primary text-white" : "border-border text-muted-foreground"}`}>{t(option.labelKey ?? CATEGORY_LABEL_KEYS[option.value] ?? option.label)}</button>)}</div>
      <div className="max-h-96 overflow-y-auto">{visibleItems.length === 0 ? <p className="p-5 text-sm text-muted-foreground">{t("notifications.noNotificationsYet")}</p> : visibleItems.map((item) => { const localized = localizeNotification(item, (key, options) => t(key, options)); return <div key={item.id} className={`border-b border-border px-4 py-3 ${item.readAt ? "" : "bg-primary/5"}`}><button type="button" onClick={() => void markRead(item.id)} className="w-full text-left"><p className="text-sm font-semibold">{localized.title}</p><p className="mt-1 text-xs text-muted-foreground">{localized.body}</p><p className="mt-1 text-[0.6875rem] text-muted-foreground">{formatDateTime(item.createdAt, locale)}</p></button>{item.link && <Link href={item.link} onClick={() => { if (!item.readAt) void markRead(item.id); setOpen(false); }} className="mt-1 inline-block text-xs font-semibold text-primary">{t("notifications.open")}</Link>}</div>; })}</div>
      {scope === "vendor" ? (visibleItems.length < visibleTotal && <div className="border-t border-border px-4 py-3 text-center"><button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="text-sm font-semibold text-primary disabled:opacity-60">{loadingMore ? t("states.loading") : t("notifications.loadMore")}</button></div>) : <div className="border-t border-border px-4 py-3 text-center"><Link href={props.allHref} onClick={() => setOpen(false)} className="text-sm font-semibold text-primary">{t("notifications.viewAll")}</Link></div>}
    </div>}
  </div>;
}

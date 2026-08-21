"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HEADER_ICON_BUTTON_CLASS } from "@/components/shared/header-icon-button";
import { formatDateTime } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { localizeNotification } from "@/lib/notifications/localize";

export type NotificationScope = "customer" | "vendor";
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

function paramsFor(props: NotificationBellProps, category = "all", read = "all", pageSize = 15) {
  const params = new URLSearchParams({ page: "1", pageSize: String(pageSize) });
  if (props.scope === "vendor") {
    params.set("scope", "vendor");
    if (props.vendorId) params.set("vendorId", props.vendorId);
  }
  if (category !== "all") params.set("category", category);
  if (read !== "all") params.set("read", read);
  return params;
}

export function NotificationBell({ scope = "customer", vendorId = null, allHref, categories }: NotificationBellProps) {
  const props = { scope, vendorId, allHref: allHref ?? "/customer/notifications", categories: categories ?? (scope === "vendor" ? VENDOR_CATEGORIES : CUSTOMER_CATEGORIES) };
  const { t, i18n } = useTranslation("common");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [category, setCategory] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const response = await fetch(`/api/notifications?${paramsFor(props, category, readFilter)}`);
      const body = await response.json() as ApiBody;
      if (response.ok && body.data) setItems(body.data.items);
      const unreadResponse = await fetch(`/api/notifications?${paramsFor(props, "all", "unread", 1)}`);
      const unreadBody = await unreadResponse.json() as ApiBody;
      if (unreadResponse.ok && unreadBody.data) setUnread(unreadBody.data.total);
    } catch {
      // Keep the last known notification state when the poll is temporarily unavailable.
    }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30_000); return () => clearInterval(timer); }, [scope, vendorId, category, readFilter]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  async function markRead(id: string) {
    const response = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    if (!response.ok) return;
    setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    setUnread((current) => Math.max(0, current - 1));
  }
  async function markAll() {
    const markAllParams = new URLSearchParams();
    if (scope === "vendor") { markAllParams.set("scope", "vendor"); if (vendorId) markAllParams.set("vendorId", vendorId); }
    const response = await fetch(`/api/notifications/read-all${markAllParams.toString() ? `?${markAllParams}` : ""}`, { method: "POST" });
    if (!response.ok) return;
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnread(0);
  }
  return <div ref={ref} className="relative shrink-0">
    <button type="button" aria-label={t("accessibility.notifications")} aria-expanded={open} onClick={() => setOpen((value) => !value)} className={HEADER_ICON_BUTTON_CLASS}>
      <Bell size={18} />{unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[0.5625rem] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_45px_rgba(1,0,102,0.16)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><p className="font-semibold">{t("notifications.title")}</p><button type="button" onClick={() => void markAll()} className="flex items-center gap-1 text-xs text-primary"><CheckCheck size={14} /> {t("notifications.markAllAsRead")}</button></div>
      <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2"><button type="button" onClick={() => { setCategory("all"); setReadFilter("unread"); }} className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold ${readFilter === "unread" ? "border-primary bg-primary text-white" : "border-border text-muted-foreground"}`}>{t("notifications.unread")}</button>{props.categories.filter((option) => option.value !== "unread").map((option) => <button key={option.value} type="button" onClick={() => { setCategory(option.value); setReadFilter("all"); }} className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold ${readFilter === "all" && category === option.value ? "border-primary bg-primary text-white" : "border-border text-muted-foreground"}`}>{t(option.labelKey ?? CATEGORY_LABEL_KEYS[option.value] ?? option.label)}</button>)}</div>
      <div className="max-h-96 overflow-y-auto">{items.length === 0 ? <p className="p-5 text-sm text-muted-foreground">{t("notifications.noNotificationsYet")}</p> : items.map((item) => { const localized = localizeNotification(item, (key, options) => t(key, options)); return <div key={item.id} className={`border-b border-border px-4 py-3 ${item.readAt ? "" : "bg-primary/5"}`}><button type="button" onClick={() => void markRead(item.id)} className="w-full text-left"><p className="text-sm font-semibold">{localized.title}</p><p className="mt-1 text-xs text-muted-foreground">{localized.body}</p><p className="mt-1 text-[0.6875rem] text-muted-foreground">{formatDateTime(item.createdAt, locale)}</p></button>{item.link && <Link href={item.link} onClick={() => { if (!item.readAt) void markRead(item.id); setOpen(false); }} className="mt-1 inline-block text-xs font-semibold text-primary">{t("notifications.open")}</Link>}</div>; })}</div>
      <div className="border-t border-border px-4 py-3 text-center"><Link href={props.allHref} onClick={() => setOpen(false)} className="text-sm font-semibold text-primary">{t("notifications.viewAll")}</Link></div>
    </div>}
  </div>;
}

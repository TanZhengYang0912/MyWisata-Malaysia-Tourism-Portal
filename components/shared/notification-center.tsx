"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Notification, NotificationBellProps } from "./notification-bell";

export type NotificationCenterProps = Omit<NotificationBellProps, "allHref"> & { pageSize?: number };
type ApiBody = { data?: { items: Notification[]; totalPages: number }; error?: { message?: string } };

const DEFAULT_CATEGORIES = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
];

export function NotificationCenter({ scope = "customer", vendorId = null, categories = DEFAULT_CATEGORIES, pageSize = 15 }: NotificationCenterProps) {
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState<Notification[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const safePageSize = Math.min(50, Math.max(1, pageSize));

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
        if (!response.ok || !body.data) { setError(body.error?.message ?? "Unable to load notifications"); return; }
        setItems(body.data.items); setTotalPages(body.data.totalPages); setError(null);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") setError("Unable to load notifications");
      }
    })();
    return () => controller.abort();
  }, [filter, page, safePageSize, scope, vendorId]);

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
    <div className="mb-5 flex flex-wrap items-center gap-2"><span className="mr-2 text-sm font-semibold text-muted-foreground">Filter</span>{categories.map((option) => <button key={option.value} type="button" onClick={() => { setFilter(option.value); setPage(1); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === option.value ? "border-primary bg-primary text-white" : "border-border text-muted-foreground"}`}>{option.label}</button>)}<button type="button" onClick={() => { setFilter("unread"); setPage(1); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === "unread" ? "border-primary bg-primary text-white" : "border-border text-muted-foreground"}`}>Unread</button><button type="button" onClick={() => void markAll()} className="ml-auto rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary">Mark all as read</button></div>
    {error && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
    <div className="rounded-2xl border border-border bg-card">{items.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No notifications found.</p> : items.map((item) => <div key={item.id} className={`border-b border-border px-5 py-4 last:border-0 ${item.readAt ? "" : "bg-primary/5"}`}><button type="button" onClick={() => void markRead(item.id)} className="w-full text-left"><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.body}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("en-MY")}</p></button>{item.link && <Link className="mt-2 inline-block text-xs font-semibold text-primary" href={item.link}>Open</Link>}</div>)}</div>
    <div className="mt-4 flex items-center justify-between text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-border px-3 py-2 disabled:opacity-50">Previous</button><span aria-live="polite">Page {page} of {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-border px-3 py-2 disabled:opacity-50">Next</button></div>
  </div>;
}

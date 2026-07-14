"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock3, Package, ReceiptText, Search, SlidersHorizontal, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getOrdersForUser } from "@/backend/domains/commerce";
import { getOutlets } from "@/backend/domains/catalogue";
import { supabase } from "@/backend/supabase";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import type { Order, Outlet } from "@/backend/core/types";
import { activityHref } from "@/lib/customer/activity-navigation";

type OrderFilterStatus = "all" | "PAID" | "COMPLETED" | "CANCELLED" | "REFUNDED" | "PENDING_PAYMENT";
type OrderFilterType = "all" | "booking" | "product" | "mixed";

const STATUS_OPTIONS: { value: OrderFilterStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "PAID", label: "Paid" },
  { value: "COMPLETED", label: "Completed" },
  { value: "PENDING_PAYMENT", label: "Pending payment" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REFUNDED", label: "Refunded" },
];
const PAGE_SIZE = 10;

function shortOrderId(id: string) { return `#${id.slice(0, 8).toUpperCase()}`; }
function orderType(order: Order): Exclude<OrderFilterType, "all"> {
  const hasBooking = order.items.some((item) => Boolean(item.slotStartsAt));
  const hasProduct = order.items.some((item) => !item.slotStartsAt);
  return hasBooking && hasProduct ? "mixed" : hasBooking ? "booking" : "product";
}
function typeLabel(type: Exclude<OrderFilterType, "all">) { return type === "mixed" ? "Mixed order" : type === "booking" ? "Booking" : "Product"; }
function paymentLabel(method?: string) { return ({ stripe_card: "Stripe demo card", ewallet: "E-wallet", bank_transfer: "Bank transfer", wallet: "MyWisata wallet", mock_card: "Demo card" } as Record<string, string>)[method ?? ""] || "Demo payment"; }
function dateLabel(value: string) { return new Date(value).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }); }
function matchesDate(value: string, from: string, to: string) {
  const time = new Date(value).getTime();
  if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && time > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

export default function OrdersPage() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderFilterStatus>("all");
  const [type, setType] = useState<OrderFilterType>("all");
  const [outletId, setOutletId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    const load = async () => {
      try {
        const [nextOrders, nextOutlets] = await Promise.all([getOrdersForUser(currentUser.id), getOutlets()]);
        if (active) { setOrders(nextOrders); setOutlets(nextOutlets); setError(""); }
      } catch (reason) {
        if (active) { setError(reason instanceof Error ? reason.message : "Could not load your orders."); setOrders([]); }
      }
    };
    void load();
    const channel = supabase
      .channel(`customer-orders-${currentUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${currentUser.id}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `customer_id=eq.${currentUser.id}` }, () => { void load(); })
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [currentUser]);

  const outletMap = useMemo(() => new Map(outlets.map((outlet) => [outlet.id, outlet])), [outlets]);
  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (orders ?? []).filter((order) => {
      if (status !== "all" && order.status !== status) return false;
      if (type !== "all" && orderType(order) !== type) return false;
      if (outletId !== "all" && !order.items.some((item) => item.outletId === outletId)) return false;
      if (!matchesDate(order.createdAt, from, to)) return false;
      if (needle && ![order.id, ...order.items.flatMap((item) => [item.activityName, item.variantLabel, outletMap.get(item.outletId)?.name || ""])].join(" ").toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [from, outletId, orders, outletMap, query, status, to, type]);

  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const visiblePage = Math.min(page, pageCount);
  const pagedOrders = filteredOrders.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE);

  const stats = useMemo(() => ({
    total: orders?.length ?? 0,
    paid: (orders ?? []).filter((order) => order.status === "PAID" || order.status === "COMPLETED").length,
    bookings: (orders ?? []).filter((order) => orderType(order) !== "product").length,
  }), [orders]);

  function clearFilters() { setQuery(""); setStatus("all"); setType("all"); setOutletId("all"); setFrom(""); setTo(""); }
  const hasFilters = Boolean(query || status !== "all" || type !== "all" || outletId !== "all" || from || to);

  if (orders === null) return <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground">Loading your orders…</div>;

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary"><ReceiptText size={14} /> Trip ledger</p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Orders, all in one place.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Receipts for every booking, meal and Malaysian experience you have collected.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2"><Link href={activityHref("itinerary")}><Button variant="outline" className="rounded-full border-primary/20 text-primary hover:bg-secondary">View itinerary</Button></Link><Link href="/customer/explore"><Button className="rounded-full bg-primary px-5 hover:bg-primary/90">Explore again</Button></Link></div>
        </header>

        <section className="mt-7 grid gap-3 sm:grid-cols-3">
          {[{ label: "Total orders", value: stats.total, icon: ReceiptText }, { label: "Paid or completed", value: stats.paid, icon: CircleCheck }, { label: "Orders with bookings", value: stats.bookings, icon: CalendarDays }].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-border bg-white px-4 py-4 shadow-[0_8px_24px_rgba(1,0,102,0.06)]"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">{label}</span><Icon size={16} className="text-primary" /></div><p className="mt-2 font-[family-name:var(--font-mono)] text-2xl font-bold text-foreground">{value}</p></div>)}
        </section>

        <section className="mt-7 rounded-2xl border border-border bg-white p-4 shadow-[0_8px_24px_rgba(1,0,102,0.06)] sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center"><label className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order ID, product or outlet" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-[rgba(1,0,102,0.12)]" /></label><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400"><SlidersHorizontal size={15} /> Filter</div></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><select value={status} onChange={(event) => setStatus(event.target.value as OrderFilterStatus)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary">{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select value={type} onChange={(event) => setType(event.target.value as OrderFilterType)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary"><option value="all">All order types</option><option value="booking">Bookings</option><option value="product">Products</option><option value="mixed">Mixed orders</option></select><select value={outletId} onChange={(event) => setOutletId(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary"><option value="all">All outlets</option>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Orders from date" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary" /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Orders to date" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>
          {hasFilters && <button type="button" onClick={clearFilters} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><X size={13} /> Clear filters</button>}
        </section>

        {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="mt-7 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">History</p><p className="mt-1 text-sm text-slate-500">{filteredOrders.length} {filteredOrders.length === 1 ? "order" : "orders"} found</p></div><span className="hidden items-center gap-1 text-xs text-slate-400 sm:inline-flex"><Clock3 size={14} /> Newest first</span></div>

        {filteredOrders.length === 0 ? <div className="mt-5"><EmptyState icon={<Package size={40} />} title={hasFilters ? "No orders match these filters" : "No orders yet"} description={hasFilters ? "Try clearing one filter or searching for another activity." : "Your booking and order history will show up here once you check out."} action={hasFilters ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : <Link href="/customer/explore"><Button>Explore experiences</Button></Link>} /></div> : <>
          <div className="mt-4 space-y-3">{pagedOrders.map((order) => { const kind = orderType(order); const orderOutlets = [...new Set(order.items.map((item) => outletMap.get(item.outletId)?.name).filter(Boolean))]; const primaryItem = order.items.find((item) => item.imageUrl) ?? order.items[0]; return <Link key={order.id} href={`/customer/orders/${order.id}`} className="group block rounded-2xl border border-border bg-white p-4 shadow-[0_6px_20px_rgba(1,0,102,0.04)] transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_12px_28px_rgba(1,0,102,0.1)] sm:p-5"><div className="flex items-start gap-3"><div className="relative mt-0.5 h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-secondary text-primary">{primaryItem?.imageUrl ? <img src={primaryItem.imageUrl} alt={primaryItem.activityName} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center">{kind === "booking" ? <CalendarDays size={22} /> : kind === "mixed" ? <ReceiptText size={22} /> : <Package size={22} />}</div>}{order.items.length > 1 && <span className="absolute bottom-1 right-1 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-bold text-white">+{order.items.length - 1}</span>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-[family-name:var(--font-mono)] text-xs font-bold text-primary">{shortOrderId(order.id)}</span><span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">{typeLabel(kind)}</span><StatusBadge status={order.status} /></div><p className="mt-3 text-sm font-semibold leading-5 text-slate-800">{order.items.slice(0, 2).map((item) => `${item.qty}× ${item.activityName}`).join(" · ")}{order.items.length > 2 ? ` +${order.items.length - 2} more` : ""}</p><p className="mt-2 text-xs text-slate-500">{orderOutlets.join(" · ") || "MyWisata marketplace"} · {paymentLabel(order.paymentMethod)}</p></div><ChevronRight size={18} className="mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-primary" /></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs"><span className="text-slate-500">{dateLabel(order.createdAt)} · {order.items.reduce((sum, item) => sum + item.qty, 0)} items</span><span className="font-[family-name:var(--font-mono)] text-sm font-bold text-primary">RM {order.total.toFixed(2)}</span></div></Link>; })}</div>
          {pageCount > 1 && <nav aria-label="Order history pagination" className="mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-[0_6px_20px_rgba(1,0,102,0.04)] sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Showing {(visiblePage - 1) * PAGE_SIZE + 1}–{Math.min(visiblePage * PAGE_SIZE, filteredOrders.length)} of {filteredOrders.length} orders</p><div className="flex items-center justify-between gap-3 sm:justify-end"><button type="button" aria-label="Previous page" disabled={visiblePage === 1} onClick={() => setPage(Math.max(1, visiblePage - 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={15} /> Previous</button><span className="min-w-20 text-center text-xs font-semibold text-slate-500">Page {visiblePage} of {pageCount}</span><button type="button" aria-label="Next page" disabled={visiblePage === pageCount} onClick={() => setPage(Math.min(pageCount, visiblePage + 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight size={15} /></button></div></nav>}
        </>}
      </div>
    </div>
  );
}

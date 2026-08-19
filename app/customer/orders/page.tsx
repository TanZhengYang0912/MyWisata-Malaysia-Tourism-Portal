"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Package, ReceiptText, Search, SlidersHorizontal, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getOrdersForUser } from "@/backend/domains/commerce";
import { getOutlets } from "@/backend/domains/catalogue";
import { productImageUrl } from "@/lib/storage/product-image";
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
function typeLabel(type: Exclude<OrderFilterType, "all">) { return type === "mixed" ? "Mixed booking" : type === "booking" ? "Booking" : "Experience"; }
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
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  const activeFilterCount = [status !== "all", type !== "all", outletId !== "all", Boolean(from), Boolean(to)].filter(Boolean).length;

  if (orders === null) return <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground">Loading your orders…</div>;

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary"><ReceiptText size={14} /> Trip ledger</p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Orders, all in one place.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Receipts for every booking, meal and Malaysian experience you have collected.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2"><Link href={activityHref("itinerary")}><Button variant="outline" className="rounded-full border-primary/20 text-primary hover:bg-secondary">View itinerary</Button></Link><Link href="/customer"><Button className="rounded-full bg-primary px-5 hover:bg-primary/90">Explore again</Button></Link></div>
        </header>

        <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted-foreground"><span className="font-[family-name:var(--font-mono)] text-base font-bold text-foreground">{stats.total}</span> orders <span className="text-muted-foreground/50">·</span> <span className="font-[family-name:var(--font-mono)] text-base font-bold text-foreground">{stats.paid}</span> paid or completed <span className="text-muted-foreground/50">·</span> <span className="font-[family-name:var(--font-mono)] text-base font-bold text-foreground">{stats.bookings}</span> with bookings</p>

        <section className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center"><label className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order ID, experience or outlet" className="h-11 w-full rounded-xl border border-border bg-secondary/50 pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-[rgba(1,0,102,0.12)]" /></label><button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-controls="order-filters" className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-primary/20 ${filtersOpen || hasFilters ? "border-primary bg-secondary text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-primary"}`}><SlidersHorizontal size={15} /> Filters {activeFilterCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] text-white">{activeFilterCount}</span>}</button></div>
          {filtersOpen && <div id="order-filters" className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-5"><select value={status} onChange={(event) => setStatus(event.target.value as OrderFilterStatus)} className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary">{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select value={type} onChange={(event) => setType(event.target.value as OrderFilterType)} className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"><option value="all">All bookings</option><option value="booking">Scheduled Bookings</option><option value="product">Open Experiences</option><option value="mixed">Mixed bookings</option></select><select value={outletId} onChange={(event) => setOutletId(event.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"><option value="all">All outlets</option>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Orders from date" className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary" /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Orders to date" className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary" /></div>}
          {hasFilters && <button type="button" onClick={clearFilters} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><X size={13} /> Clear filters</button>}
        </section>

        {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="mt-7 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">History</p><p className="mt-1 text-sm text-muted-foreground">{filteredOrders.length} {filteredOrders.length === 1 ? "order" : "orders"} found</p></div><span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex"><Clock3 size={14} /> Newest first</span></div>

        {filteredOrders.length === 0 ? <div className="mt-5"><EmptyState icon={<Package size={40} />} title={hasFilters ? "No orders match these filters" : "No orders yet"} description={hasFilters ? "Try clearing one filter or searching for another activity." : "Your booking and order history will show up here once you check out."} action={hasFilters ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : <Link href="/customer"><Button>Explore experiences</Button></Link>} /></div> : <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="mt-4 space-y-4">{pagedOrders.map((order) => { 
            const kind = orderType(order); 
            const orderOutlets = [...new Set(order.items.map((item) => outletMap.get(item.outletId)?.name).filter(Boolean))]; 
            const primaryItem = order.items.find((item) => item.imageUrl) ?? order.items[0]; 
            
            return (
              <Link key={order.id} href={`/customer/orders/${order.id}`} className="group block rounded-2xl border border-border bg-card p-4 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6">
                  {/* Image/Icon Box - Enlarge for better visual */}
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-secondary text-primary shadow-sm sm:h-24 sm:w-24">
                    {primaryItem?.imageUrl ? (
                      <img src={productImageUrl(primaryItem.imageUrl) || ''} alt={primaryItem.activityName} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent">
                        {kind === "booking" ? <CalendarDays size={28} className="opacity-80" /> : kind === "mixed" ? <ReceiptText size={28} className="opacity-80" /> : <Package size={28} className="opacity-80" />}
                      </div>
                    )}
                    {order.items.length > 1 && (
                      <span className="absolute bottom-1.5 right-1.5 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[10px] font-bold text-background shadow backdrop-blur-sm">
                        +{order.items.length - 1}
                      </span>
                    )}
                  </div>
                  
                  {/* Middle Left: Primary Details */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-[family-name:var(--font-mono)] text-xs font-bold text-primary">{shortOrderId(order.id)}</span>
                      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">{typeLabel(kind)}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-base font-bold leading-snug text-foreground md:text-lg">
                      {order.items.slice(0, 2).map((item) => `${item.qty}× ${item.activityName}`).join(" · ")}
                      {order.items.length > 2 ? <span className="text-muted-foreground"> +{order.items.length - 2} more</span> : ""}
                    </p>
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <span className="truncate">{orderOutlets.join(" · ") || "MyWisata marketplace"}</span>
                    </p>
                  </div>
                  
                  {/* Middle Right: Date & Meta (Fills the gap on desktop) */}
                  <div className="hidden min-w-32 flex-col items-end gap-1 border-l border-border pl-6 lg:flex xl:min-w-40">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Order Date</span>
                    <span className="text-sm font-semibold text-foreground">{dateLabel(order.createdAt)}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><Package size={12} /> {order.items.reduce((sum, item) => sum + item.qty, 0)} items</span>
                  </div>

                  {/* Far Right: Total & Action Arrow */}
                  <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border pt-4 sm:border-0 sm:pt-0 lg:pl-4">
                    <div className="flex flex-col sm:items-end">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 sm:hidden">Total Amount</span>
                      <span className="font-[family-name:var(--font-mono)] text-lg font-bold text-primary lg:text-xl">
                        RM {order.total.toFixed(2)}
                      </span>
                      <span className="mt-1 text-xs font-medium text-muted-foreground sm:hidden">
                        {dateLabel(order.createdAt)} · {order.items.reduce((sum, item) => sum + item.qty, 0)} items
                      </span>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/50 text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
                      <ChevronRight size={16} className="transition group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </div>
              </Link>
            ); 
          })}</div>
          {pageCount > 1 && <nav aria-label="Order history pagination" className="mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Showing {(visiblePage - 1) * PAGE_SIZE + 1}–{Math.min(visiblePage * PAGE_SIZE, filteredOrders.length)} of {filteredOrders.length} orders</p><div className="flex items-center justify-between gap-3 sm:justify-end"><button type="button" aria-label="Previous page" disabled={visiblePage === 1} onClick={() => setPage(Math.max(1, visiblePage - 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={15} /> Previous</button><span className="min-w-20 text-center text-xs font-semibold text-muted-foreground">Page {visiblePage} of {pageCount}</span><button type="button" aria-label="Next page" disabled={visiblePage === pageCount} onClick={() => setPage(Math.min(pageCount, visiblePage + 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight size={15} /></button></div></nav>}
        </>}
      </div>
    </div>
  );
}

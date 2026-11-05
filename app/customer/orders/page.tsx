"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Package, ReceiptText, Search, SlidersHorizontal, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { productImageUrl } from "@/lib/storage/product-image";
import { supabase } from "@/backend/supabase";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import type { Order, Outlet } from "@/backend/core/types";
import { activityHref } from "@/lib/customer/activity-navigation";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { formatMYR } from "@/lib/i18n/format";
import { getMalaysiaDateRangeDefaults } from "@/lib/datetime/date-input";
import { formatOrderReference } from "@/lib/checkout/order-reference";
import { isInvalidMalaysiaDateRange } from "@/lib/datetime/malaysia";

import { useVisibleReviewRefresh } from "@/hooks/use-visible-review-refresh";

type OrderFilterStatus = "all" | "PAID" | "COMPLETED" | "CANCELLED" | "REFUNDED" | "PENDING_PAYMENT";
type OrderFilterType = "all" | "booking" | "product" | "mixed";

const STATUS_OPTIONS: { value: OrderFilterStatus; key: string }[] = [
  { value: "all", key: "ui.orders.allStatuses" },
  { value: "PAID", key: "ui.orders.paid" },
  { value: "COMPLETED", key: "ui.orders.completed" },
  { value: "PENDING_PAYMENT", key: "ui.orders.pendingPayment" },
  { value: "CANCELLED", key: "ui.orders.cancelled" },
  { value: "REFUNDED", key: "ui.orders.refunded" },
];
const PAGE_SIZE = 10;

function orderType(order: Order): Exclude<OrderFilterType, "all"> {
  const hasBooking = order.items.some((item) => Boolean(item.slotStartsAt));
  const hasProduct = order.items.some((item) => !item.slotStartsAt);
  return hasBooking && hasProduct ? "mixed" : hasBooking ? "booking" : "product";
}
function typeLabelKey(type: Exclude<OrderFilterType, "all">) {
  return type === "mixed" ? "ui.orders.mixedOrder" : type === "booking" ? "ui.orders.bookingOrder" : "ui.orders.productOrder";
}
function dateLabel(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale === "en" ? "en-MY" : locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });
}
function OrderStatusBadge({ status, refundedLabel }: { status: string; refundedLabel: string }) {
  if (status !== "REFUNDED") return <StatusBadge status={status} />;
  return <span className="rounded-full bg-muted px-2.5 py-1 text-[0.625rem] font-bold text-muted-foreground">{refundedLabel}</span>;
}

export default function OrdersPage() {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const { currentUser } = useAuth();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderFilterStatus>("all");
  const [type, setType] = useState<OrderFilterType>("all");
  const [outletId, setOutletId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  type Snapshot = { owner: string; key: string; orders: Order[]; outlets: Pick<Outlet, "id" | "name">[]; total: number; page: number; stats: { total: number; paid: number; bookings: number } };
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failureKey, setFailureKey] = useState<string | null>(null);
  const invalidDateRange = Boolean(from && to && isInvalidMalaysiaDateRange(from, to));
  const owner = currentUser?.id ?? "";
  const requestKey = JSON.stringify([owner, query, status, type, outletId, from, to, page]);
  const currentKey = useRef(requestKey);
  useEffect(() => { currentKey.current = requestKey; }, [requestKey]);
  const { refresh } = useVisibleReviewRefresh({
    enabled: Boolean(owner) && !invalidDateRange,
    identityKey: owner,
    intervalMs: null,
    initialRefresh: true,
    coalesceMs: 150,
    refreshKey: requestKey,
    onRefresh: async (signal) => {
      const key = requestKey;
      const params = new URLSearchParams({ query, status, type, outletId, from, to, page: String(page) });
      try {
        const response = await fetch(`/api/customer/orders?${params}`, { signal, cache: "no-store" });
        if (!response.ok) throw Object.assign(new Error("orders_unavailable"), { status: response.status });
        const payload = await response.json();
        if (signal.aborted || currentKey.current !== key) return;
        setSnapshot({ ...payload.data, owner, key });
        setFailureKey(null);
      } catch (error) {
        if (!signal.aborted && currentKey.current === key) setFailureKey(key);
        throw error;
      }
    },
  });
  useEffect(() => {
    if (!owner) return;
    const channel = supabase.channel(`customer-orders-${owner}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${owner}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `customer_id=eq.${owner}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [owner, refresh]);
  const data = snapshot?.owner === owner ? snapshot : null;
  const currentData = data?.key === requestKey ? data : null;
  const outlets = data?.outlets ?? [];
  const outletMap = useMemo(() => new Map((data?.outlets ?? []).map((outlet) => [outlet.id, outlet])), [data?.outlets]);
  const error = failureKey === requestKey ? tCustomer("ui.orders.loadError") : "";
  const total = currentData?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visiblePage = currentData?.page ?? 1;
  const pagedOrders = currentData?.orders ?? [];
  const stats = data?.stats ?? { total: 0, paid: 0, bookings: 0 };
  const loading = !currentData && !error && !invalidDateRange;

  function primeDateRange() {
    const defaults = getMalaysiaDateRangeDefaults();
    setFrom((value) => value || defaults.from);
    setTo((value) => value || defaults.to);
    setPage(1);
  }

  function clearFilters() { setPage(1); setQuery(""); setStatus("all"); setType("all"); setOutletId("all"); setFrom(""); setTo(""); }
  const hasFilters = Boolean(query || status !== "all" || type !== "all" || outletId !== "all" || from || to);
  const activeFilterCount = [status !== "all", type !== "all", outletId !== "all", Boolean(from), Boolean(to)].filter(Boolean).length;

  return (
    <div className="min-h-full bg-background">
      <CustomerPageTitle
        eyebrow={tCustomer("ui.labels.history")}
        title={tCustomer("ui.orders.title")}
        icon={<ReceiptText size={14} />}
        actions={<>
          <Link href={activityHref("itinerary")}><Button variant="outline" className="rounded-full border-primary/20 text-primary hover:bg-secondary">{tCustomer("ui.calendar.viewItinerary")}</Button></Link>
          <Link href="/customer"><Button className="rounded-full bg-primary px-5 hover:bg-primary/90">{tCustomer("ui.actions.continueExploring")}</Button></Link>
        </>}
        className="mb-0"
      />
      <CustomerPageShell wide className="pt-0 sm:pt-0">

        {data && <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted-foreground"><span className="font-[family-name:var(--font-mono)] text-base font-bold text-foreground">{stats.total}</span> {tCustomer("ui.orders.summaryOrders")} <span className="text-muted-foreground/50">·</span> <span className="font-[family-name:var(--font-mono)] text-base font-bold text-foreground">{stats.paid}</span> {tCustomer("ui.orders.summaryPaid")} <span className="text-muted-foreground/50">·</span> <span className="font-[family-name:var(--font-mono)] text-base font-bold text-foreground">{stats.bookings}</span> {tCustomer("ui.orders.summaryBookings")}</p>}

        <section className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center"><label className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input maxLength={200} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={tCustomer("ui.orders.search")} aria-label={tCustomer("ui.orders.search")} className="h-11 w-full rounded-xl border border-border bg-secondary/50 pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-[rgba(1,0,102,0.12)]" /></label><button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-controls="order-filters" className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-primary/20 ${filtersOpen || hasFilters ? "border-primary bg-secondary text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-primary"}`}><SlidersHorizontal size={15} /> {tCustomer("ui.orders.filters")} {activeFilterCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] text-white">{activeFilterCount}</span>}</button></div>
          {filtersOpen && <div id="order-filters" className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-5"><select value={status} onChange={(event) => { setStatus(event.target.value as OrderFilterStatus); setPage(1); }} aria-label={tCustomer("ui.labels.status")} className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary">{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{tCustomer(option.key)}</option>)}</select><select value={type} onChange={(event) => { setType(event.target.value as OrderFilterType); setPage(1); }} aria-label={tCustomer("ui.orders.allTypes")} className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"><option value="all">{tCustomer("ui.orders.allTypes")}</option><option value="booking">{tCustomer("ui.orders.bookingOrder")}</option><option value="product">{tCustomer("ui.orders.productOrder")}</option><option value="mixed">{tCustomer("ui.orders.mixedOrder")}</option></select><select value={outletId} onChange={(event) => { setOutletId(event.target.value); setPage(1); }} aria-label={tCustomer("ui.orders.allOutlets")} className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"><option value="all">{tCustomer("ui.orders.allOutlets")}</option>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select><input type="date" value={from} onFocus={primeDateRange} onChange={(event) => { setFrom(event.target.value); setPage(1); }} aria-label={tCustomer("ui.orders.fromDate")} className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary" /><input type="date" value={to} onFocus={primeDateRange} onChange={(event) => { setTo(event.target.value); setPage(1); }} aria-label={tCustomer("ui.orders.toDate")} className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary" /></div>}
          {hasFilters && <button type="button" onClick={clearFilters} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><X size={13} /> {tCustomer("ui.actions.clearFilters")}</button>}
        </section>
        {invalidDateRange && <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{tCustomer("ui.orders.invalidDateRange")}</p>}

        {error && <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><span>{error}</span><Button type="button" variant="outline" onClick={refresh}>{tCustomer("ui.actions.retry")}</Button></div>}
        {currentData && <div className="mt-7 flex items-center justify-between"><p className="text-sm text-muted-foreground">{tCustomer("ui.orders.found", { count: total })}</p><span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex"><Clock3 size={14} /> {tCustomer("ui.labels.newestFirst")}</span></div>}

        {loading ? <p role="status" className="mt-5 text-sm text-muted-foreground">{tCustomer("ui.states.loading")}</p> : error && !currentData ? null : invalidDateRange ? null : total === 0 ? <div className="mt-5"><EmptyState icon={<Package size={40} />} title={hasFilters ? tCustomer("ui.orders.noMatch") : tCustomer("ui.states.noOrders")} description={hasFilters ? tCustomer("ui.orders.tryFilters") : tCustomer("ui.orders.emptyDescription")} action={hasFilters ? <Button variant="outline" onClick={clearFilters}>{tCustomer("ui.actions.clearFilters")}</Button> : <Link href="/customer"><Button>{tCustomer("ui.actions.viewExperiences")}</Button></Link>} /></div> : <>
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
                      // eslint-disable-next-line @next/next/no-img-element
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
                      <span className="font-[family-name:var(--font-mono)] text-xs font-bold text-primary">{formatOrderReference(order.id, order.displayId)}</span>
                      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">{tCustomer(typeLabelKey(kind))}</span>
                      <OrderStatusBadge status={order.status} refundedLabel={tCustomer("ui.orders.refunded")} />
                    </div>
                    <p className="text-base font-bold leading-snug text-foreground md:text-lg">
                      {order.items.slice(0, 2).map((item) => `${item.qty}× ${item.activityName}`).join(" · ")}
                      {order.items.length > 2 ? <span className="text-muted-foreground">{tCustomer("ui.orders.moreItems", { count: order.items.length - 2 })}</span> : ""}
                    </p>
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-muted-foreground">
                      <span className="break-words whitespace-normal">{orderOutlets.join(" · ") || tCustomer("ui.orders.marketplace")}</span>
                    </p>
                  </div>
                  
                  {/* Middle Right: Date & Meta (Fills the gap on desktop) */}
                  <div className="hidden min-w-32 flex-col items-end gap-1 border-l border-border pl-6 lg:flex xl:min-w-40">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{tCustomer("ui.labels.date")}</span>
                    <span className="text-sm font-semibold text-foreground">{dateLabel(order.createdAt, i18n.resolvedLanguage || i18n.language)}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><Package size={12} /> {order.items.reduce((sum, item) => sum + item.qty, 0)} {tCustomer("ui.labels.items")}</span>
                  </div>

                  {/* Far Right: Total & Action Arrow */}
                  <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border pt-4 sm:border-0 sm:pt-0 lg:pl-4">
                    <div className="flex flex-col sm:items-end">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 sm:hidden">{tCustomer("ui.checkout.total")}</span>
                      <span className="font-[family-name:var(--font-mono)] text-lg font-bold text-primary lg:text-xl">
                        {formatMYR(order.total)}
                      </span>
                      <span className="mt-1 text-xs font-medium text-muted-foreground sm:hidden">
                        {dateLabel(order.createdAt, i18n.resolvedLanguage || i18n.language)} · {order.items.reduce((sum, item) => sum + item.qty, 0)} {tCustomer("ui.labels.items")}
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
          {pageCount > 1 && <nav aria-label={tCustomer("ui.orders.paginationLabel")} className="mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">{tCustomer("ui.orders.showing", { from: (visiblePage - 1) * PAGE_SIZE + 1, to: Math.min(visiblePage * PAGE_SIZE, total), total: total })}</p><div className="flex items-center justify-between gap-3 sm:justify-end"><button type="button" aria-label={tCustomer("ui.orders.previousPage")} disabled={visiblePage === 1} onClick={() => setPage(Math.max(1, visiblePage - 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={15} /> {tCustomer("ui.orders.previous")}</button><span className="min-w-20 text-center text-xs font-semibold text-muted-foreground">{tCustomer("ui.orders.pageOf", { page: visiblePage, pages: pageCount })}</span><button type="button" aria-label={tCustomer("ui.orders.nextPage")} disabled={visiblePage === pageCount} onClick={() => setPage(Math.min(pageCount, visiblePage + 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">{tCustomer("ui.orders.next")} <ChevronRight size={15} /></button></div></nav>}
        </>}
      </CustomerPageShell>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Filter, MapPin, Search, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getBookingsForUser } from "@/backend/domains/commerce";
import { getOutlets } from "@/backend/domains/catalogue";
import { supabase } from "@/backend/supabase";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { Booking, Outlet } from "@/backend/core/types";

type BookingScope = "upcoming" | "past" | "all";

function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function addMonths(date: Date, amount: number) { return new Date(date.getFullYear(), date.getMonth() + amount, 1); }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function monthLabel(date: Date) { return date.toLocaleDateString("en-MY", { month: "long", year: "numeric" }); }
function timeLabel(value?: string) { return value ? new Date(value).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }) : "Time pending"; }
function dateLabel(value?: string) { return value ? new Date(value).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Date to be confirmed"; }
function statusLabel(status: Booking["status"]) { return status === "checked_in" ? "Checked in" : status === "no_show" ? "No-show" : status.charAt(0).toUpperCase() + status.slice(1); }
function statusClass(status: Booking["status"]) { return status === "cancelled" || status === "no_show" ? "bg-red-50 text-red-700" : status === "checked_in" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"; }

export default function CustomerCalendarPage() {
  const { currentUser } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [monthStart, setMonthStart] = useState<Date | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [scope, setScope] = useState<BookingScope>("upcoming");
  const [outletId, setOutletId] = useState("all");
  const [activityId, setActivityId] = useState("all");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => { setMonthStart(startOfMonth(new Date())); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    const load = async () => {
      try {
        const [nextBookings, nextOutlets] = await Promise.all([getBookingsForUser(currentUser.id), getOutlets()]);
        if (active) { setBookings(nextBookings); setOutlets(nextOutlets); setNow(Date.now()); setError(""); }
      } catch (reason) {
        if (active) { setError(reason instanceof Error ? reason.message : "Could not load your bookings."); setBookings([]); }
      }
    };
    void load();
    const channel = supabase
      .channel(`customer-calendar-${currentUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `customer_id=eq.${currentUser.id}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_slots" }, () => { void load(); })
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [currentUser]);

  const outletMap = useMemo(() => new Map(outlets.map((outlet) => [outlet.id, outlet])), [outlets]);
  const activityOptions = useMemo(() => [...new Map((bookings ?? []).map((booking) => [booking.activityId, booking.activityName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [bookings]);
  const filteredBookings = useMemo(() => {
    const currentTime = now ?? 0;
    const needle = query.trim().toLowerCase();
    return (bookings ?? []).filter((booking) => {
      const start = booking.slotStartsAt ? new Date(booking.slotStartsAt).getTime() : Number.POSITIVE_INFINITY;
      if (scope === "upcoming" && (start < currentTime || booking.status === "cancelled")) return false;
      if (scope === "past" && start >= currentTime && booking.status !== "cancelled") return false;
      if (outletId !== "all" && booking.outletId !== outletId) return false;
      if (activityId !== "all" && booking.activityId !== activityId) return false;
      if (from && (!booking.slotStartsAt || start < new Date(`${from}T00:00:00`).getTime())) return false;
      if (to && (!booking.slotStartsAt || start > new Date(`${to}T23:59:59`).getTime())) return false;
      if (needle && ![booking.activityName, outletMap.get(booking.outletId)?.name || "", booking.orderId].join(" ").toLowerCase().includes(needle)) return false;
      return true;
    }).sort((a, b) => new Date(a.slotStartsAt || "9999-12-31").getTime() - new Date(b.slotStartsAt || "9999-12-31").getTime());
  }, [activityId, bookings, from, now, outletId, outletMap, query, scope, to]);

  const bookingsByDay = useMemo(() => filteredBookings.reduce<Record<string, Booking[]>>((result, booking) => {
    if (!booking.slotStartsAt) return result;
    (result[dateKey(new Date(booking.slotStartsAt))] ??= []).push(booking);
    return result;
  }, {}), [filteredBookings]);

  const calendarDays = useMemo(() => {
    if (!monthStart) return [] as Date[];
    const first = startOfMonth(monthStart);
    const mondayOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(gridStart.getDate() + index); return day; });
  }, [monthStart]);

  const stats = useMemo(() => {
    const currentTime = now ?? 0;
    return { total: filteredBookings.length, upcoming: filteredBookings.filter((booking) => booking.slotStartsAt && new Date(booking.slotStartsAt).getTime() >= currentTime && booking.status !== "cancelled").length, month: monthStart ? filteredBookings.filter((booking) => booking.slotStartsAt && new Date(booking.slotStartsAt).getMonth() === monthStart.getMonth() && new Date(booking.slotStartsAt).getFullYear() === monthStart.getFullYear()).length : 0 };
  }, [filteredBookings, monthStart, now]);

  const hasFilters = Boolean(scope !== "upcoming" || outletId !== "all" || activityId !== "all" || query || from || to);
  function clearFilters() { setScope("upcoming"); setOutletId("all"); setActivityId("all"); setQuery(""); setFrom(""); setTo(""); }
  function goToToday() { setMonthStart(startOfMonth(new Date())); }

  if (bookings === null || monthStart === null) return <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground">Loading your calendar…</div>;

  return (
    <div className="min-h-full bg-[#f7faf7]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700"><CalendarDays size={14} /> Your itinerary</p><h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[#17372e] sm:text-4xl">Booking calendar</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">See the moments you have planned, from the next massage to your next island day.</p></div><div className="flex items-center gap-2"><Button variant="outline" onClick={goToToday} className="rounded-full border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50">Today</Button><Link href="/customer/explore"><Button className="rounded-full bg-emerald-700 hover:bg-emerald-800">Find an experience</Button></Link></div></header>

        <section className="mt-7 grid gap-3 sm:grid-cols-3">{[{ label: "Shown bookings", value: stats.total }, { label: "Upcoming", value: stats.upcoming }, { label: "This month", value: stats.month }].map((item) => <div key={item.label} className="rounded-2xl border border-emerald-100 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,93,74,0.05)]"><p className="text-xs font-semibold text-slate-500">{item.label}</p><p className="mt-2 font-[family-name:var(--font-mono)] text-2xl font-bold text-[#17372e]">{item.value}</p></div>)}</section>

        <section className="mt-7 rounded-2xl border border-emerald-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,93,74,0.05)] sm:p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><label className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity, outlet or order ID" className="h-11 w-full rounded-xl border border-slate-200 bg-[#fbfdfb] pl-10 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label><span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400"><Filter size={15} /> Filter</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><select value={scope} onChange={(event) => setScope(event.target.value as BookingScope)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500"><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All bookings</option></select><select value={outletId} onChange={(event) => setOutletId(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500"><option value="all">All outlets</option>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select><select value={activityId} onChange={(event) => setActivityId(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500"><option value="all">All activities</option>{activityOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Bookings from date" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500" /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Bookings to date" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500" /></div>{hasFilters && <button type="button" onClick={clearFilters} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"><X size={13} /> Clear filters</button>}</section>

        {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <section className="mt-7 overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-[0_12px_32px_rgba(15,93,74,0.06)]"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-6"><button type="button" onClick={() => setMonthStart(addMonths(monthStart, -1))} aria-label="Previous month" className="rounded-xl p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"><ChevronLeft size={20} /></button><div className="text-center"><p className="font-[family-name:var(--font-display)] text-xl font-bold text-[#17372e]">{monthLabel(monthStart)}</p><p className="mt-1 text-xs text-slate-400">{filteredBookings.length} matching bookings</p></div><button type="button" onClick={() => setMonthStart(addMonths(monthStart, 1))} aria-label="Next month" className="rounded-xl p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"><ChevronRight size={20} /></button></div><div className="hidden md:block"><div className="grid grid-cols-7 border-b border-slate-100 bg-[#fbfdfb]">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="px-3 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{day}</div>)}</div><div className="grid grid-cols-7">{calendarDays.map((day) => { const key = dateKey(day); const dayBookings = bookingsByDay[key] || []; const inMonth = day.getMonth() === monthStart.getMonth(); return <div key={key} className={`min-h-[132px] border-b border-r border-slate-100 p-2.5 ${inMonth ? "bg-white" : "bg-slate-50/70"}`}><p className={`mb-2 text-xs font-bold ${inMonth ? "text-slate-700" : "text-slate-300"}`}>{day.getDate()}</p><div className="space-y-1.5">{dayBookings.slice(0, 3).map((booking) => <Link key={booking.id} href={`/customer/orders/${booking.orderId}`} className="block rounded-lg border-l-2 border-emerald-500 bg-emerald-50 px-2 py-1.5 transition hover:bg-emerald-100"><p className="truncate text-[11px] font-bold text-emerald-950">{booking.activityName}</p><p className="mt-0.5 text-[10px] text-emerald-800">{timeLabel(booking.slotStartsAt)} · {booking.qty} pax</p></Link>)}{dayBookings.length > 3 && <p className="px-2 text-[10px] font-bold text-amber-700">+{dayBookings.length - 3} more</p>}</div></div>; })}</div></div><div className="space-y-3 p-4 md:hidden">{filteredBookings.length === 0 ? <EmptyState icon={<CalendarDays size={36} />} title="No bookings found" description={hasFilters ? "Try changing your filters." : "Your booked activities will appear here after checkout."} /> : filteredBookings.map((booking) => <Link key={booking.id} href={`/customer/orders/${booking.orderId}`} className="block rounded-2xl border border-emerald-100 bg-[#fbfdfb] p-4 transition hover:border-emerald-300"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-800">{booking.activityName}</p><p className="mt-1 text-xs font-semibold text-emerald-700">{dateLabel(booking.slotStartsAt)} · {timeLabel(booking.slotStartsAt)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass(booking.status)}`}>{statusLabel(booking.status)}</span></div><p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><MapPin size={13} /> {outletMap.get(booking.outletId)?.name || "MyWisata outlet"} · Qty {booking.qty}</p><p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400"><Clock3 size={12} /> Order #{booking.orderId.slice(0, 8).toUpperCase()}</p></Link>)}</div></section>

        <div className="mt-6 md:hidden">{filteredBookings.length === 0 && <p className="text-center text-xs text-slate-400">No bookings match the selected filters.</p>}</div>
      </div>
    </div>
  );
}

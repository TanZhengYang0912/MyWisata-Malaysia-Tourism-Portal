"use client";

import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, Filter, MapPin, ReceiptText, Search, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getBookingsForUser } from "@/backend/domains/commerce";
import { getOutlets } from "@/backend/domains/catalogue";
import { supabase } from "@/backend/supabase";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { BookingDayDrawer } from "@/components/customer/booking-day-drawer";
import type { Booking, Outlet } from "@/backend/core/types";
import { activityHref } from "@/lib/customer/activity-navigation";
import { getBookingViewCopy, type BookingViewScope } from "@/lib/customer/booking-view";
import { calendarDateKey, countItineraryGroupsInMonth, formatBookingDate, formatBookingTime, formatCalendarDate, getHiddenItineraryGroupCount, groupBookings, groupBookingsByDay, type BookingItineraryGroup } from "@/lib/customer/itinerary-calendar";

type BookingScope = "upcoming" | "past" | "all";

const MONTH_OPTIONS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function addMonths(date: Date, amount: number) { return new Date(date.getFullYear(), date.getMonth() + amount, 1); }
function monthLabel(date: Date) { return date.toLocaleDateString("en-MY", { month: "long", year: "numeric" }); }
function statusLabel(status: BookingItineraryGroup["status"]) { return status === "mixed" ? "Mixed status" : status === "checked_in" ? "Checked in" : status === "no_show" ? "No-show" : status.charAt(0).toUpperCase() + status.slice(1); }
function statusClass(status: BookingItineraryGroup["status"]) { return status === "mixed" || status === "cancelled" || status === "no_show" ? "bg-red-50 text-malaysia-red" : status === "checked_in" ? "bg-[#FFF4CC] text-[#7A5A00]" : "bg-secondary text-primary"; }

export default function CustomerCalendarPage({ initialScope = "upcoming" }: { initialScope?: BookingScope } = {}) {
  const { t: tCustomer } = useTranslation("customer");
  const { currentUser } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [monthStart, setMonthStart] = useState<Date | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [scope, setScope] = useState<BookingScope>(initialScope);
  const [outletId, setOutletId] = useState("all");
  const [activityId, setActivityId] = useState("all");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

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
        if (active) { setSelectedDayKey(null); setBookings(nextBookings); setOutlets(nextOutlets); setNow(Date.now()); setError(""); }
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

  const bookingsByDay = useMemo(() => groupBookingsByDay(filteredBookings), [filteredBookings]);
  const itineraryGroups = useMemo(() => groupBookings(filteredBookings), [filteredBookings]);

  const calendarDays = useMemo(() => {
    if (!monthStart) return [] as Date[];
    const first = startOfMonth(monthStart);
    const mondayOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(gridStart.getDate() + index); return day; });
  }, [monthStart]);

  const viewScope: BookingViewScope = scope;
  const viewCopy = getBookingViewCopy(viewScope);
  const monthItineraryGroupCount = useMemo(() => monthStart ? countItineraryGroupsInMonth(filteredBookings, monthStart) : 0, [filteredBookings, monthStart]);
  const calendarYearOptions = useMemo(() => {
    const currentYear = new Date(now ?? monthStart!).getFullYear();
    const years = Array.from({ length: 9 }, (_, index) => currentYear - 2 + index);
    if (monthStart && !years.includes(monthStart.getFullYear())) years.push(monthStart.getFullYear());
    return years.sort((a, b) => a - b);
  }, [monthStart, now]);
  const selectedDayGroups = selectedDayKey ? bookingsByDay[selectedDayKey] ?? [] : [];
  const selectedDayDate = selectedDayKey ? new Date(`${selectedDayKey}T12:00:00`) : null;
  const hasFilters = Boolean(scope !== "upcoming" || outletId !== "all" || activityId !== "all" || query || from || to);
  const activeFilterCount = [scope !== "upcoming", outletId !== "all", activityId !== "all", Boolean(query), Boolean(from), Boolean(to)].filter(Boolean).length;
  const closeBookingDay = useCallback(() => setSelectedDayKey(null), []);
  function clearFilters() { setSelectedDayKey(null); setScope("upcoming"); setOutletId("all"); setActivityId("all"); setQuery(""); setFrom(""); setTo(""); }
  function goToToday() { setSelectedDayKey(null); setMonthStart(startOfMonth(new Date())); }
  function selectCalendarMonth(month: number) { setSelectedDayKey(null); setMonthStart(new Date(monthStart!.getFullYear(), month, 1)); }
  function selectCalendarYear(year: number) { setSelectedDayKey(null); setMonthStart(new Date(year, monthStart!.getMonth(), 1)); }

  if (bookings === null || monthStart === null) return <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground">{tCustomer("ui.calendar.loading")}</div>;

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6 sm:py-3">
        <section aria-label="Booking calendar" className="overflow-hidden rounded-3xl border border-border bg-white shadow-[0_12px_32px_rgba(1,0,102,0.06)]">
          <h1 className="sr-only">{viewCopy.title}</h1>
          <div className="border-b border-slate-100">
            <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
              <button type="button" onClick={() => { setSelectedDayKey(null); setMonthStart(addMonths(monthStart, -1)); }} aria-label="Previous month" className="rounded-xl p-2 text-slate-500 hover:bg-secondary hover:text-primary"><ChevronLeft size={20} /></button>
              <div className="relative text-center">
                <button type="button" onClick={() => setMonthPickerOpen((open) => !open)} aria-expanded={monthPickerOpen} aria-haspopup="dialog" aria-controls="calendar-month-picker" className="inline-flex items-center gap-1 rounded-xl px-2 py-1 font-[family-name:var(--font-display)] text-xl font-bold text-foreground transition hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30">
                  {monthLabel(monthStart)} <ChevronDown size={17} aria-hidden="true" />
                </button>
                <p className="mt-1 text-xs text-slate-400">{monthItineraryGroupCount === itineraryGroups.length ? `${itineraryGroups.length} itinerary items` : `${monthItineraryGroupCount} in this month · ${itineraryGroups.length} matching overall`}</p>
                {monthPickerOpen && <div id="calendar-month-picker" role="dialog" aria-label="Choose calendar month and year" className="absolute left-1/2 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-border bg-white p-4 text-left shadow-xl">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Choose month</p>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <span>Choose year</span>
                      <select value={monthStart.getFullYear()} onChange={(event) => selectCalendarYear(Number(event.target.value))} aria-label="Choose year" className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                        {calendarYearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {MONTH_OPTIONS.map((month, index) => <button key={month} type="button" onClick={() => selectCalendarMonth(index)} aria-label={`Select ${month}`} aria-pressed={monthStart.getMonth() === index} className={`rounded-lg px-2 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary/30 ${monthStart.getMonth() === index ? "bg-primary text-white" : "text-slate-600 hover:bg-secondary hover:text-primary"}`}>{month}</button>)}
                  </div>
                  <button type="button" onClick={() => setMonthPickerOpen(false)} className="mt-3 w-full rounded-lg border border-primary/20 px-3 py-2 text-sm font-bold text-primary transition hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30">Done</button>
                </div>}
              </div>
              <button type="button" onClick={() => { setSelectedDayKey(null); setMonthStart(addMonths(monthStart, 1)); }} aria-label="Next month" className="rounded-xl p-2 text-slate-500 hover:bg-secondary hover:text-primary"><ChevronRight size={20} /></button>
            </div>
            <div aria-label="Calendar actions" className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 sm:px-6">
              <Link href={activityHref("orders")} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/20 bg-white px-3 text-xs font-bold text-primary hover:bg-secondary"><ReceiptText size={14} /> Orders & receipts</Link>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={goToToday} className="h-9 rounded-full border-primary/20 bg-white px-3 text-xs text-primary hover:bg-secondary">Today</Button>
                <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-controls="calendar-filters" className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-primary/20 ${filtersOpen || hasFilters ? "border-primary bg-secondary text-primary" : "border-slate-200 bg-white text-slate-500 hover:border-primary/30 hover:text-primary"}`}><Filter size={14} /> Filters {activeFilterCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] text-white">{activeFilterCount}</span>}</button>
              </div>
            </div>
            {filtersOpen && <div id="calendar-filters" className="border-t border-slate-100 px-4 py-3 sm:px-6"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6"><label className="relative min-w-0 lg:col-span-2"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => { setSelectedDayKey(null); setQuery(event.target.value); }} placeholder="Search bookings" aria-label="Search activity, outlet or order ID" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-[rgba(1,0,102,0.12)]" /></label><select value={scope} onChange={(event) => { setSelectedDayKey(null); setScope(event.target.value as BookingScope); }} aria-label="Booking scope" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary"><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All bookings</option></select><select value={outletId} onChange={(event) => { setSelectedDayKey(null); setOutletId(event.target.value); }} aria-label="Booking outlet" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary"><option value="all">All outlets</option>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select><select value={activityId} onChange={(event) => { setSelectedDayKey(null); setActivityId(event.target.value); }} aria-label="Booking activity" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary"><option value="all">All activities</option>{activityOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><input type="date" value={from} onChange={(event) => { setSelectedDayKey(null); setFrom(event.target.value); }} aria-label="Bookings from date" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary" /><input type="date" value={to} onChange={(event) => { setSelectedDayKey(null); setTo(event.target.value); }} aria-label="Bookings to date" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>{hasFilters && <button type="button" onClick={clearFilters} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><X size={13} /> Clear filters</button>}</div>}
          </div>
          {error && <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:m-5">{error}</div>}
            <div className="hidden md:block"><div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="px-3 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{day}</div>)}</div><div className="grid grid-cols-7">{calendarDays.map((day) => { const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`; const dayGroups = bookingsByDay[key] || []; const inMonth = day.getMonth() === monthStart.getMonth() && day.getFullYear() === monthStart.getFullYear(); const hiddenCount = getHiddenItineraryGroupCount(dayGroups); return <div key={key} className={`min-h-[104px] border-b border-r border-slate-100 p-2 ${inMonth ? "bg-white" : "bg-slate-50/70"}`}><p className={`mb-1.5 text-xs font-bold ${inMonth ? "text-slate-700" : "text-slate-300"}`}>{day.getDate()}</p><div className="space-y-1">{dayGroups.slice(0, 3).map((group) => <button key={group.key} type="button" onClick={() => setSelectedDayKey(key)} className="block w-full rounded-lg border-l-2 border-primary bg-secondary px-2 py-1 text-left transition hover:bg-secondary/70 focus:outline-none focus:ring-2 focus:ring-primary/30" aria-label={`Show ${group.activityName} itinerary details`}><p className="truncate text-[11px] font-bold text-primary">{group.activityName}</p><p className="mt-0.5 text-[10px] text-primary">{formatBookingTime(group.slotStartsAt)} · {group.totalQty} pax</p></button>)}{hiddenCount > 0 && <button type="button" onClick={() => setSelectedDayKey(key)} aria-label={`Show ${hiddenCount} more itinerary items for ${formatCalendarDate(day)}`} className="px-2 text-left text-[10px] font-bold text-primary underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-primary/30">+{hiddenCount} more</button>}</div></div>; })}</div></div><div className="space-y-3 p-4 md:hidden">{itineraryGroups.length === 0 ? <EmptyState icon={<CalendarDays size={36} />} title="No bookings found" description={hasFilters ? "Try changing your filters." : "Your booked activities will appear here after checkout."} /> : itineraryGroups.map((group) => <button key={group.key} type="button" onClick={() => group.slotStartsAt && setSelectedDayKey(calendarDateKey(new Date(group.slotStartsAt)))} className="block w-full rounded-2xl border border-border bg-slate-50/70 p-4 text-left transition hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/30"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-800">{group.activityName}</p><p className="mt-1 text-xs font-semibold text-primary">{formatBookingDate(group.slotStartsAt)} · {formatBookingTime(group.slotStartsAt)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass(group.status)}`}>{statusLabel(group.status)}</span></div><p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><MapPin size={13} /> {outletMap.get(group.outletId)?.name || "MyWisata outlet"} · {group.totalQty} pax · {group.bookings.length} booking{group.bookings.length === 1 ? "" : "s"}</p><p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400"><Clock3 size={12} /> View itinerary details</p></button>)}</div>
        </section>

        <div className="mt-6 md:hidden">{itineraryGroups.length === 0 && <p className="text-center text-xs text-slate-400">No bookings match the selected filters.</p>}</div>
      </div>
      {selectedDayDate && selectedDayGroups.length > 0 && <BookingDayDrawer date={selectedDayDate} groups={selectedDayGroups} outletMap={outletMap} onClose={closeBookingDay} />}
    </div>
  );
}

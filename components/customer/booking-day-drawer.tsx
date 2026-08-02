"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CalendarDays, Clock3, MapPin, Users, X } from "lucide-react";
import type { Booking, Outlet } from "@/backend/core/types";
import { formatBookingTime } from "@/lib/customer/itinerary-calendar";

function statusLabel(status: Booking["status"]) {
  return status === "checked_in" ? "Checked in" : status === "no_show" ? "No-show" : status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClass(status: Booking["status"]) {
  return status === "cancelled" || status === "no_show" ? "bg-red-50 text-malaysia-red" : status === "checked_in" ? "bg-[#FFF4CC] text-[#7A5A00]" : "bg-secondary text-primary";
}

export function BookingDayDrawer({
  date,
  bookings,
  outletMap,
  onClose,
}: {
  date: Date;
  bookings: Booking[];
  outletMap: Map<string, Outlet>;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    closeButtonRef.current?.focus();
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <div aria-hidden="true" onMouseDown={onClose} className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" />
      <aside ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="booking-day-drawer-title" className="relative z-[80] flex max-h-[min(780px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary"><CalendarDays size={14} /> Day itinerary</p>
            <h2 id="booking-day-drawer-title" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-foreground">{date.toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
            <p className="mt-1 text-sm text-slate-500">{bookings.length} booking{bookings.length === 1 ? "" : "s"} on this day</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close booking list" className="rounded-xl p-2 text-slate-500 transition hover:bg-secondary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"><X size={20} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="space-y-3">
            {bookings.map((booking) => {
              const outletName = outletMap.get(booking.outletId)?.name || "MyWisata outlet";
              return <Link key={booking.id} href={`/customer/orders/${booking.orderId}`} className="block rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-primary/30 hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                <div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-sm font-bold text-slate-900">{booking.activityName}</p><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${statusClass(booking.status)}`}>{statusLabel(booking.status)}</span></div>
                <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2"><span className="inline-flex items-center gap-1.5"><Clock3 size={14} className="text-primary" /> {formatBookingTime(booking.slotStartsAt)}</span><span className="inline-flex items-center gap-1.5"><Users size={14} className="text-primary" /> {booking.qty} pax</span><span className="inline-flex items-center gap-1.5 sm:col-span-2"><MapPin size={14} className="text-primary" /> {outletName}</span></div>
                <p className="mt-3 text-xs font-semibold text-primary">View booking <span aria-hidden="true">→</span></p>
              </Link>;
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

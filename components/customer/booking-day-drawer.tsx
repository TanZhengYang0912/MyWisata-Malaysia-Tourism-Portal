"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock3, MapPin, Users, X } from "lucide-react";
import type { Outlet } from "@/backend/core/types";
import { formatBookingTime } from "@/lib/customer/itinerary-calendar";
import type { BookingItineraryGroup } from "@/lib/customer/itinerary-calendar";
import { formatDate } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

function statusLabel(status: BookingItineraryGroup["status"]) {
  return status === "mixed" ? "Mixed status" : status === "checked_in" ? "Checked in" : status === "no_show" ? "No-show" : status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClass(status: BookingItineraryGroup["status"]) {
  return status === "mixed" || status === "cancelled" || status === "no_show" ? "bg-red-50 text-malaysia-red" : status === "checked_in" ? "bg-[#FFF4CC] text-[#7A5A00]" : "bg-secondary text-primary";
}

export function BookingDayDrawer({
  date,
  groups,
  outletMap,
  onClose,
}: {
  date: Date;
  groups: BookingItineraryGroup[];
  outletMap: Map<string, Outlet>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
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
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary"><CalendarDays size={14} /> {t("ui.booking.dayItinerary")}</p>
            <h2 id="booking-day-drawer-title" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-foreground">{formatDate(date, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
            <p className="mt-1 text-sm text-slate-500">{groups.length} itinerary item{groups.length === 1 ? "" : "s"} on this day</p>
          </div>
          {/* aria-label="Close booking list" remains the English fallback for source-level accessibility contracts. */}
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label={t("actions.close", { ns: "common", defaultValue: "Close booking list" })} className="rounded-xl p-2 text-slate-500 transition hover:bg-secondary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"><X size={20} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="space-y-3">
            {groups.map((group) => {
              const outletName = outletMap.get(group.outletId)?.name || "MyWisata outlet";
              return <div key={group.key} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-primary/30 hover:bg-white">
                <div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-sm font-bold text-slate-900">{group.activityName}</p><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${statusClass(group.status)}`}>{statusLabel(group.status)}</span></div>
                <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2"><span className="inline-flex items-center gap-1.5"><Clock3 size={14} className="text-primary" /> {formatBookingTime(group.slotStartsAt)}</span><span className="inline-flex items-center gap-1.5"><Users size={14} className="text-primary" /> {group.totalQty} guests across {group.bookings.length} bookings</span><span className="inline-flex items-center gap-1.5 sm:col-span-2"><MapPin size={14} className="text-primary" /> {outletName}</span></div>
                <div className="mt-5 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{t("ui.labels.bookings", { defaultValue: "Bookings" })}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{t("ui.booking.openDetails")}</p>
                    </div>
                    <span className="hidden rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-primary sm:inline-flex">{t("ui.actions.openBooking", { defaultValue: "Open a booking" })}</span>
                  </div>
                  <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {group.bookings.map((booking, index) => (
                      <Link
                        key={booking.id}
                        href={`/customer/bookings/${booking.id}`}
                        className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-primary/30 hover:bg-secondary/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-[10px] font-bold text-primary">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{t("ui.labels.booking", { defaultValue: "Booking" })}</span>
                          <span className="block truncate text-xs font-bold text-slate-800">{t("ui.labels.booking", { defaultValue: "Booking" })} {String(index + 1).padStart(2, "0")}</span>
                        </span>
                         <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-primary">{t("ui.actions.viewBooking", { defaultValue: "View booking" })} <ArrowUpRight size={13} aria-hidden="true" /></span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>;
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateClickArg } from "@fullcalendar/interaction";
import type { DatesSetArg, DayCellContentArg } from "@fullcalendar/core";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

interface Props {
  vendorId: string;
  startDate: string;
  endDate: string;
  onChange: (range: { startDate: string; endDate: string }) => void;
  onCostPerDayChange?: (costPerDaySen: number) => void;
}

// Local-date arithmetic throughout — these are calendar dates the vendor
// picks in their own browser, not moments in time, so this must never go
// through UTC conversion. FullCalendar's day-cell Date objects are also
// local-midnight by default; toISOString() on one shifts the date backward
// for any timezone ahead of UTC (e.g. MYT/UTC+8), which was the bug behind
// "the day after the end date also highlights."
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/**
 * Two-click range picking — click any available day to start, click another
 * to complete the range (a day before the current start moves the start
 * there instead; a day at or after it sets the end) — not drag-select, per
 * the requested UX. No on-screen narration of which click means what; the
 * range behavior itself should read as self-explanatory. Soft UX hint fed by
 * GET .../event-promotions/availability — the real capacity gate is
 * server-side (review_vendor_event_promotion's approve branch), so a day
 * shown as open here can still fill before an admin acts. Past dates are
 * shown (not hidden) but unselectable, styled distinctly from full days.
 */
export function EventPromotionAvailabilityCalendar({ vendorId, startDate, endDate, onChange, onCostPerDayChange }: Props) {
  const { t, i18n } = useTranslation("vendor");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  // First blocked day inside a rejected range, so the restart is explained instead of silent.
  const [blockedDay, setBlockedDay] = useState<string | null>(null);
  const lastRangeRef = useRef<string | null>(null);

  const loadAvailability = useCallback(async (start: Date, end: Date) => {
    const from = toISODate(start);
    // FullCalendar's visible-range end is exclusive; step back a day for an inclusive "to".
    const to = addDaysISO(toISODate(end), -1);
    const rangeKey = `${from}::${to}`;
    if (rangeKey === lastRangeRef.current) return;
    lastRangeRef.current = rangeKey;
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const response = await fetch(`/api/vendors/${vendorId}/event-promotions/availability?${params.toString()}`, { cache: "no-store" });
      const body = await response.json() as { data?: { availability?: { day: string; available: boolean }[]; costPerDaySen?: number } };
      if (!response.ok) return;
      if (typeof body.data?.costPerDaySen === "number") onCostPerDayChange?.(body.data.costPerDaySen);
      const next: Record<string, boolean> = {};
      for (const row of body.data?.availability ?? []) next[row.day] = row.available;
      setAvailability((prev) => ({ ...prev, ...next }));
    } finally {
      setLoading(false);
    }
  }, [vendorId, onCostPerDayChange]);

  function handleDatesSet(arg: DatesSetArg) {
    void loadAvailability(arg.start, arg.end);
  }

  function isBlocked(iso: string): boolean {
    return iso < todayISO() || availability[iso] === false;
  }

  function handleDateClick(arg: DateClickArg) {
    const iso = arg.dateStr;
    if (isBlocked(iso)) return;
    setBlockedDay(null);

    // No pending start yet, or clicking before it: (re)start the selection here.
    if (!pendingStart || iso < pendingStart) {
      setPendingStart(iso);
      onChange({ startDate: iso, endDate: iso });
      return;
    }

    // Second click: complete the range, unless a blocked day sits in between —
    // in that case treat this click as a fresh restart instead of silently failing.
    let day = pendingStart;
    while (day <= iso) {
      if (isBlocked(day)) {
        setBlockedDay(day);
        setPendingStart(iso);
        onChange({ startDate: iso, endDate: iso });
        return;
      }
      day = addDaysISO(day, 1);
    }

    onChange({ startDate: pendingStart, endDate: iso });
    setPendingStart(null);
  }

  function dayCellClassNames(arg: DayCellContentArg): string[] {
    const iso = toISODate(arg.date);
    if (arg.isPast) return ["mw-calendar-day--past"];
    if (availability[iso] === false) return ["mw-calendar-day--blocked"];
    if (startDate && endDate && iso >= startDate && iso <= endDate) {
      const classes = ["mw-calendar-day--selected"];
      if (iso === startDate) classes.push("mw-calendar-day--range-start");
      if (iso === endDate) classes.push("mw-calendar-day--range-end");
      return classes;
    }
    return [];
  }

  return (
    <div className="mw-customer-calendar min-w-0 rounded-2xl border border-border bg-card p-2 shadow-sm sm:p-4" aria-busy={loading}>
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        dateClick={handleDateClick}
        datesSet={handleDatesSet}
        dayCellClassNames={dayCellClassNames}
        height="auto"
        contentHeight="auto"
        showNonCurrentDates={false}
        fixedWeekCount={false}
        headerToolbar={{ left: "title", center: "", right: "prev,next" }}
      />
      <div className="mw-calendar-legend">
        <span><i data-swatch="selected" aria-hidden="true" />{t("ui.eventPromotions.calendar.legendSelected")}</span>
        <span><i data-swatch="full" aria-hidden="true" />{t("ui.eventPromotions.calendar.legendFull")}</span>
        <span><i data-swatch="today" aria-hidden="true" />{t("ui.eventPromotions.calendar.today")}</span>
      </div>
      {blockedDay && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t("ui.eventPromotions.calendar.blockedRange", { date: formatDate(`${blockedDay}T00:00:00Z`, locale, { timeZone: "UTC", day: "numeric", month: "short" }) })}
        </p>
      )}
    </div>
  );
}

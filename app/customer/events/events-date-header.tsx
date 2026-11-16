"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { addMalaysiaCalendarDays } from "@/lib/datetime/date-input";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

// Icon buttons follow the carousel arrows: navy at rest, yellow on hover and press.
const ICON_BUTTON = "inline-flex h-10 items-center justify-center text-primary transition-[color,transform] duration-150 hover:text-accent active:scale-[0.85] active:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";
/** SeeMoreLink's look for a text button (Today). */
export const SEE_MORE_TEXT = "inline-flex min-h-10 items-center text-sm font-bold text-primary transition-colors hover:text-accent hover:underline active:text-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/** Formats a YYYY-MM-DD calendar date as written (no timezone shift). */
function formatDay(day: string, locale: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** "Friday 13 Nov" (en/ms); zh-CN keeps its own order ("11月13日星期五"). */
export function headingFor(day: string, locale: string) {
  const options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" };
  const date = new Date(`${day}T00:00:00Z`);
  if (locale === "zh-CN") return new Intl.DateTimeFormat(locale, options).format(date);
  const parts = new Intl.DateTimeFormat(locale, options).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

/**
 * The Events date filter beside the page title. With no date it is only the calendar button; with one it is
 * ‹ [that day and its event count] › and the calendar. Tapping the chosen day again in the calendar clears it.
 */
export function EventsDateFilter({
  date,
  today,
  countOn,
  onSelect,
}: {
  date: string | null;
  today: string;
  countOn: (day: string) => number;
  onSelect: (day: string | null) => void;
}) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [open, setOpen] = useState(false);
  const calendarButtonRef = useRef<HTMLButtonElement>(null);
  const count = date ? countOn(date) : 0;

  return (
    // The calendar opens under the whole row: from its left edge on phones (the row starts the line), from its right edge
    // from lg, where the page header puts the row at the right end of the title.
    <div className="relative flex items-center gap-1.5">
      {date && (
        <>
          <button type="button" onClick={() => onSelect(addMalaysiaCalendarDays(date, -1))} disabled={date <= today} aria-label={t("ui.promotionCampaigns.datePicker.previousDay")} className={`${ICON_BUTTON} w-8 disabled:cursor-not-allowed disabled:text-primary/20 disabled:active:scale-100`}>
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          {/* Shows the chosen day; it is not a control (the calendar changes or clears it). */}
          <p aria-live="polite" className="grid min-h-[55px] w-[clamp(46px,5.25vw,70px)] min-w-[58px] content-center justify-items-center gap-px rounded-[5px] border border-primary bg-primary text-primary-foreground min-[900px]:min-h-[66px]">
            <span className="sr-only">{t("ui.promotionCampaigns.datePicker.dayEvents", { date: formatDay(date, locale, { weekday: "long", day: "numeric", month: "long" }), count })}</span>
            <span aria-hidden="true" className="text-[11px] text-[#fff3ac] dark:text-primary-foreground">{formatDay(date, locale, { weekday: "short" })}</span>
            <span aria-hidden="true" className="tabular-nums text-[20px] font-bold leading-[1.1] min-[900px]:text-[23px]">{formatDay(date, locale, { day: "numeric" })}</span>
            {count > 0 && <span aria-hidden="true" className="min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-extrabold leading-4 text-primary tabular-nums">{count}</span>}
          </p>
          <button type="button" onClick={() => onSelect(addMalaysiaCalendarDays(date, 1))} aria-label={t("ui.promotionCampaigns.datePicker.nextDay")} className={`${ICON_BUTTON} w-8`}>
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        </>
      )}
      <div>
        <button
          ref={calendarButtonRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={t("ui.promotionCampaigns.datePicker.openCalendar")}
          className={`${ICON_BUTTON} w-10`}
        >
          <CalendarDays size={24} aria-hidden="true" />
        </button>
        {open && (
          <EventsMonthPicker
            date={date}
            today={today}
            locale={locale}
            countOn={countOn}
            onSelect={(value) => {
              setOpen(false);
              onSelect(value);
            }}
            onClose={(refocus) => {
              setOpen(false);
              if (refocus) calendarButtonRef.current?.focus();
            }}
            anchorRef={calendarButtonRef}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The month calendar under the calendar button, with each day's event count. Opens on the chosen day's month (or
 * today's); past days are disabled; tapping the chosen day clears it. Esc and a click outside close it.
 */
function EventsMonthPicker({
  date,
  today,
  locale,
  countOn,
  onSelect,
  onClose,
  anchorRef,
}: {
  date: string | null;
  today: string;
  locale: string;
  countOn: (day: string) => number;
  onSelect: (day: string | null) => void;
  onClose: (refocus: boolean) => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation("customer");
  const [month, setMonth] = useState(`${(date ?? today).slice(0, 7)}-01`);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (dialogRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onCloseRef.current(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [anchorRef]);

  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const leadingBlanks = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const days = Array.from({ length }, (_, index) => addMalaysiaCalendarDays(month, index));
  // 2024-01-01 is a Monday: the week starts on Monday.
  const weekdays = Array.from({ length: 7 }, (_, index) => formatDay(addMalaysiaCalendarDays("2024-01-01", index), locale, { weekday: "short" }));
  const shiftMonth = (step: number) => {
    const first = new Date(Date.UTC(year, monthIndex + step, 1));
    setMonth(first.toISOString().slice(0, 10));
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label={t("ui.promotionCampaigns.datePicker.chooseDate")}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose(true);
        }
      }}
      className="absolute left-0 top-[calc(100%+8px)] lg:left-auto lg:right-0 z-30 w-[min(284px,calc(100vw-32px))] rounded-[8px] border border-border bg-card p-2.5 shadow-[0_10px_26px_rgba(1,0,102,0.12)]"
    >
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shiftMonth(-1)} disabled={month <= `${today.slice(0, 7)}-01`} aria-label={t("ui.promotionCampaigns.datePicker.previousMonth")} className={`${ICON_BUTTON} w-8 disabled:cursor-not-allowed disabled:text-primary/20 disabled:active:scale-100`}>
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <strong aria-live="polite" className="text-[15px] font-bold text-primary">{formatDay(month, locale, { month: "long", year: "numeric" })}</strong>
        <button type="button" onClick={() => shiftMonth(1)} aria-label={t("ui.promotionCampaigns.datePicker.nextMonth")} className={`${ICON_BUTTON} w-8`}>
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-0.5 text-center">
        {weekdays.map((weekday) => <span key={weekday} aria-hidden="true" className="py-1 text-[11px] text-muted-foreground">{weekday}</span>)}
        {Array.from({ length: leadingBlanks }, (_, index) => <span key={`blank-${index}`} />)}
        {days.map((value, index) => {
          const selected = value === date;
          const past = value < today;
          const count = past ? 0 : countOn(value);
          return (
            <button
              key={value}
              type="button"
              // Opening the calendar puts focus on the chosen day.
              autoFocus={selected}
              disabled={past}
              onClick={() => onSelect(selected ? null : value)}
              aria-pressed={selected}
              aria-label={formatDay(value, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              className={`relative h-10 rounded-[5px] pb-2 text-sm ring-primary hover:ring-1 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:text-muted-foreground/45 disabled:hover:ring-0 ${selected ? "bg-primary text-primary-foreground" : "text-foreground"}`}
            >
              {index + 1}
              {count > 0 && <b aria-hidden="true" className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] font-extrabold leading-none tabular-nums ${selected ? "text-accent" : "text-primary"}`}>{count}</b>}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-end">
        <button type="button" onClick={() => onSelect(today)} className={SEE_MORE_TEXT}>{t("ui.calendar.today")}</button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { addMalaysiaCalendarDays } from "@/lib/datetime/date-input";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

// Icon buttons follow the carousel arrows: navy at rest, yellow on hover and press.
const ICON_BUTTON = "inline-flex h-10 items-center justify-center text-primary transition-[color,transform] duration-150 hover:text-accent active:scale-[0.85] active:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";
/** SeeMoreLink's look for a text button (Today, Back to today). */
export const SEE_MORE_TEXT = "inline-flex min-h-10 items-center text-sm font-bold text-primary transition-colors hover:text-accent hover:underline active:text-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/** Formats a YYYY-MM-DD calendar date as written (no timezone shift). */
function formatDay(day: string, locale: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** "Friday 13 Nov" (en/ms); zh-CN keeps its own order ("11月13日星期五"). */
function headingFor(day: string, locale: string) {
  const options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" };
  const date = new Date(`${day}T00:00:00Z`);
  if (locale === "zh-CN") return new Intl.DateTimeFormat(locale, options).format(date);
  const parts = new Intl.DateTimeFormat(locale, options).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

/** The Events page title and date picker: the chosen day as the heading, a 5-day strip with it in the middle, and a month calendar. */
export function EventsDateHeader({
  day,
  today,
  hasEvents,
  onSelect,
}: {
  day: string;
  today: string;
  hasEvents: (day: string) => boolean;
  onSelect: (day: string) => void;
}) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [open, setOpen] = useState(false);
  const calendarButtonRef = useRef<HTMLButtonElement>(null);
  const strip = [-2, -1, 0, 1, 2].map((offset) => addMalaysiaCalendarDays(day, offset));

  return (
    <header className="grid grid-cols-1 items-center gap-3 border-b border-border pb-3 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:gap-[18px] min-[900px]:pb-5">
      <h1 className="font-[family-name:var(--font-display)] text-[clamp(35px,10vw,49px)] font-bold leading-none tracking-[-0.035em] text-primary min-[900px]:text-[clamp(43px,5.05vw,74px)]">
        {headingFor(day, locale)}
      </h1>
      <div className="grid max-w-[485px] grid-cols-[40px_32px_minmax(0,1fr)_32px] items-center gap-1.5 min-[900px]:max-w-none max-[520px]:grid-cols-[40px_28px_minmax(0,1fr)_28px] max-[520px]:gap-1">
        <div className="relative">
          <button
            ref={calendarButtonRef}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={t("ui.promotionCampaigns.datePicker.openCalendar")}
            className={`${ICON_BUTTON} w-full`}
          >
            <CalendarDays size={24} aria-hidden="true" />
          </button>
          {open && (
            <EventsMonthPicker
              day={day}
              today={today}
              locale={locale}
              hasEvents={hasEvents}
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
        <button type="button" onClick={() => onSelect(addMalaysiaCalendarDays(day, -1))} aria-label={t("ui.promotionCampaigns.datePicker.previousDay")} className={`${ICON_BUTTON} w-full`}>
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <div className="grid grid-cols-5 gap-[5px] max-[520px]:gap-0.5">
          {strip.map((value) => {
            const selected = value === day;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onSelect(value)}
                aria-pressed={selected}
                aria-label={formatDay(value, locale, { weekday: "long", day: "numeric", month: "long" })}
                className={`grid min-h-[55px] w-full content-center justify-items-center gap-px rounded-[5px] border transition-colors hover:border-primary focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-primary/30 min-[900px]:min-h-[66px] min-[900px]:w-[clamp(46px,5.25vw,70px)] max-[520px]:min-h-[53px] ${selected ? "border-primary bg-primary text-primary-foreground" : "border-transparent text-foreground"}`}
              >
                <span aria-hidden="true" className={`text-[11px] max-[520px]:text-[10px] ${selected ? "text-[#fff3ac] max-[520px]:text-accent dark:text-primary-foreground dark:max-[520px]:text-primary-foreground" : ""}`}>{formatDay(value, locale, { weekday: "short" })}</span>
                <span aria-hidden="true" className="tabular-nums text-[20px] font-bold leading-[1.1] min-[900px]:text-[23px]">{formatDay(value, locale, { day: "numeric" })}</span>
                <span aria-hidden="true" className={`size-[5px] rounded-full ${selected ? "bg-accent" : "bg-primary"} ${hasEvents(value) ? "" : "invisible"}`} />
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => onSelect(addMalaysiaCalendarDays(day, 1))} aria-label={t("ui.promotionCampaigns.datePicker.nextDay")} className={`${ICON_BUTTON} w-full`}>
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

/** The month calendar under the calendar button. Opens on the chosen day's month; Esc and a click outside close it. */
function EventsMonthPicker({
  day,
  today,
  locale,
  hasEvents,
  onSelect,
  onClose,
  anchorRef,
}: {
  day: string;
  today: string;
  locale: string;
  hasEvents: (day: string) => boolean;
  onSelect: (day: string) => void;
  onClose: (refocus: boolean) => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation("customer");
  const [month, setMonth] = useState(`${day.slice(0, 7)}-01`);
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
    const date = new Date(Date.UTC(year, monthIndex + step, 1));
    setMonth(date.toISOString().slice(0, 10));
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
      className="absolute left-0 top-[calc(100%+8px)] z-30 w-[min(284px,calc(100vw-32px))] rounded-[8px] border border-border bg-card p-2.5 shadow-[0_10px_26px_rgba(1,0,102,0.12)]"
    >
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label={t("ui.promotionCampaigns.datePicker.previousMonth")} className={`${ICON_BUTTON} w-8`}>
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
          const selected = value === day;
          return (
            <button
              key={value}
              type="button"
              // Opening the calendar puts focus on the chosen day.
              autoFocus={selected}
              onClick={() => onSelect(value)}
              aria-pressed={selected}
              aria-label={formatDay(value, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              className={`relative h-9 rounded-[5px] text-sm ring-primary hover:ring-1 focus-visible:outline-none focus-visible:ring-2 ${selected ? "bg-primary text-primary-foreground" : "text-foreground"}`}
            >
              {index + 1}
              {hasEvents(value) && <span aria-hidden="true" className={`absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full ${selected ? "bg-accent" : "bg-primary"}`} />}
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

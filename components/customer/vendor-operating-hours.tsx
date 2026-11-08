"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OperatingHourWeekday, OperatingHours } from "@/backend/core/types";
import { formatPeriods } from "@/components/customer/operating-hours-summary";
import { DISPLAY_OPERATING_HOUR_WEEKDAYS, getDayTrackSegments, getMalaysiaTodayKey, getOperatingHoursPeriods } from "@/lib/customer/operating-hours";

// 2026-11-02 is a Monday; adding the weekday index gives a date to read each long day name from.
const MONDAY = Date.UTC(2026, 10, 2, 12);
const ROW_GAP_PERCENT = 11;
const EDGE_PERCENT = 6;

function clock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

type DayState = "open" | "closed" | "unknown";

function dayState(hours: OperatingHours, day: OperatingHourWeekday): DayState {
  const schedule = hours[day];
  if (!schedule) return "unknown";
  return getOperatingHoursPeriods(schedule).length > 0 ? "open" : "closed";
}

/** Open/close labels on the track: a label too close to the last one in row 1 drops to row 2, else it is skipped. */
export function placeTrackLabels(boundaries: number[]) {
  let lastTop = -Infinity;
  let lastBottom = -Infinity;
  return boundaries.flatMap((minutes): Array<{ minutes: number; percent: number; row: 1 | 2 }> => {
    const percent = (minutes / 1440) * 100;
    if (percent - lastTop >= ROW_GAP_PERCENT) { lastTop = percent; return [{ minutes, percent, row: 1 }]; }
    if (percent - lastBottom >= ROW_GAP_PERCENT) { lastBottom = percent; return [{ minutes, percent, row: 2 }]; }
    return [];
  });
}

/** The week as seven dots, with the selected day's opening hours drawn on a 24-hour track. */
export function VendorOperatingHours({ hours }: { hours: OperatingHours | null }) {
  const { t, i18n } = useTranslation("customer");
  const [today, setToday] = useState<OperatingHourWeekday | null>(null);
  const [selected, setSelected] = useState<OperatingHourWeekday | null>(null);

  useEffect(() => {
    // Today is read after mount so the server HTML never pins a day.
    const key = getMalaysiaTodayKey();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(key);
    setSelected(key);
  }, []);

  if (!hours) return <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("ui.vendor.checkSchedule")}</p>;

  const longDay = new Intl.DateTimeFormat(i18n?.resolvedLanguage || "en", { weekday: "long", timeZone: "UTC" });
  const selectedState = selected ? dayState(hours, selected) : "unknown";
  const segments = selected ? getDayTrackSegments(hours, selected) : [];
  const labels = placeTrackLabels(segments.flatMap((segment) => [segment.start, segment.end]).filter((minutes) => minutes > 0 && minutes < 1440));

  return (
    <div className="mt-1.5 max-w-[300px]">
      <div className="grid grid-cols-7">
        {DISPLAY_OPERATING_HOUR_WEEKDAYS.map((day, index) => {
          const state = dayState(hours, day);
          const hoursText = state === "unknown"
            ? t("ui.operatingHours.unavailable")
            : formatPeriods(hours, day, t("ui.operatingHours.closed"), t("ui.operatingHours.unavailable"), t("ui.operatingHours.allDay"));
          return (
            <button
              key={day}
              type="button"
              aria-pressed={selected === day}
              aria-label={`${longDay.format(new Date(MONDAY + index * 86_400_000))}: ${hoursText}`}
              onClick={() => setSelected(day)}
              className="flex flex-col items-center rounded-md py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <span
                data-hours-dot={state}
                className="h-[11px] w-[11px] rounded-full"
                style={{
                  background: `var(--mw-hours-${state})`,
                  boxShadow: selected === day ? "0 0 0 2px var(--card), 0 0 0 4px var(--primary)" : undefined,
                }}
              />
              <span className={`mt-0.5 text-[10px] ${today === day ? "font-extrabold text-foreground" : "text-muted-foreground"}`}>{t(`ui.vendor.hours.dayShort.${day}`)}</span>
            </button>
          );
        })}
      </div>
      <div
        data-hours-track={selected && selectedState === "closed" && segments.length === 0 ? "closed" : "day"}
        className="relative mt-2 h-1.5 rounded-full"
        style={selected && selectedState === "closed" && segments.length === 0
          ? { background: "repeating-linear-gradient(45deg, var(--mw-hours-hatch) 0 5px, var(--card) 5px 10px)", boxShadow: "inset 0 0 0 1px var(--mw-hours-hatch-border)" }
          : { background: "var(--mw-hours-track)" }}
      >
        {segments.map((segment) => (
          <span
            key={segment.start}
            data-hours-segment
            className="absolute inset-y-0 rounded-full"
            style={{ left: `${(segment.start / 1440) * 100}%`, width: `${((segment.end - segment.start) / 1440) * 100}%`, background: "var(--mw-hours-segment)" }}
          />
        ))}
      </div>
      <div className="relative h-6 text-[9.5px] text-foreground">
        {labels.map((label) => (
          <span
            key={label.minutes}
            data-hours-label-row={label.row}
            className="absolute whitespace-nowrap"
            style={{
              top: label.row === 1 ? 2 : 12,
              left: `${label.percent}%`,
              transform: label.percent < EDGE_PERCENT ? undefined : label.percent > 100 - EDGE_PERCENT ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {clock(label.minutes)}
          </span>
        ))}
      </div>
    </div>
  );
}

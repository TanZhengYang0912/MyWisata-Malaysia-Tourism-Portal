"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatBookingCalendarMonth,
  formatBookingSlotTime,
  getAdjacentBookingMonth,
  getBookingCalendarDays,
  getBookingDatePreview,
  getTodayBookingDateKey,
  groupBookableBookingSlotsByDate,
  groupBookingSlotsByDate,
  isBookingSlotAvailable,
} from "@/lib/customer/booking-slot-presenter";
import type { DetailBodyProps } from "./types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Date + time slot picker. Shared by the categories that book a moment in time
 * (activities, stays); the date state lives here because nothing outside this
 * panel reads it — the cart only needs the chosen slot id.
 */
export function BookingPanel({ activity, slots, slotId, onSlotChange, label }: DetailBodyProps & { label: string }) {
  const now = useMemo(() => new Date(), []);
  const slotDateGroups = useMemo(() => groupBookingSlotsByDate(slots), [slots]);
  const bookableDateGroups = useMemo(() => groupBookableBookingSlotsByDate(slots, now), [slots, now]);
  const firstDateKey = bookableDateGroups[0]?.key ?? slotDateGroups[0]?.key ?? getTodayBookingDateKey(now);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => firstDateKey);
  const [displayedMonthKey, setDisplayedMonthKey] = useState<string>(() => firstDateKey.slice(0, 7));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const activeDateKey = bookableDateGroups.some((group) => group.key === selectedDateKey) ? selectedDateKey : bookableDateGroups[0]?.key ?? "";
  const activeDateGroup = bookableDateGroups.find((group) => group.key === activeDateKey);
  const previewDateGroups = getBookingDatePreview(bookableDateGroups, activeDateKey);
  const calendarDays = useMemo(() => getBookingCalendarDays(slots, displayedMonthKey, now), [slots, displayedMonthKey, now]);
  const availableSlotCount = activeDateGroup?.slots.length ?? 0;

  if (!activity.requiresBooking) return null;

  const chooseDate = (dateKey: string) => {
    setSelectedDateKey(dateKey);
    setDisplayedMonthKey(dateKey.slice(0, 7));
    setCalendarOpen(false);
    onSlotChange("");
  };

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="block text-xs font-semibold text-muted-foreground">{label}</label>
        {slots.length > 0 && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setCalendarOpen((open) => !open)}
              aria-expanded={calendarOpen}
              aria-controls="booking-availability-calendar"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-secondary"
            >
              <CalendarDays size={13} /> Calendar
            </button>

            {calendarOpen && (
              <div id="booking-availability-calendar" role="dialog" aria-label="Choose an available date" className="absolute right-0 z-20 mt-2 w-[min(320px,calc(100vw-3rem))] rounded-2xl border border-border bg-white p-4 shadow-xl">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">{formatBookingCalendarMonth(displayedMonthKey)}</p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Previous month"
                      onClick={() => setDisplayedMonthKey((month) => getAdjacentBookingMonth(month, -1))}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label="Next month"
                      onClick={() => setDisplayedMonthKey((month) => getAdjacentBookingMonth(month, 1))}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground">
                  {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
                </div>

                <div className="mt-2 grid grid-cols-7 gap-1">
                  {calendarDays.map((day) => {
                    const available = day.status === "available";
                    const selected = day.key === activeDateKey;
                    const stateLabel = day.status === "available" ? `${day.availableSlotCount} available ${day.availableSlotCount === 1 ? "time" : "times"}` : day.status === "full" ? "Full" : "Unavailable";
                    return (
                      <button
                        key={day.key}
                        type="button"
                        disabled={!available}
                        aria-pressed={selected}
                        aria-label={`${day.label}: ${stateLabel}`}
                        onClick={() => chooseDate(day.key)}
                        className={`flex min-h-10 flex-col items-center justify-center rounded-lg text-xs transition-colors disabled:cursor-not-allowed ${
                          selected ? "bg-primary font-bold text-white" : available ? "font-semibold text-foreground hover:bg-secondary" : "text-muted-foreground/45"
                        } ${day.isCurrentMonth ? "" : "opacity-45"}`}
                      >
                        <span>{day.day}</span>
                        {available && <span className={`mt-0.5 h-1 w-1 rounded-full ${selected ? "bg-white" : "bg-emerald-500"}`} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Available</span>
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> Full</span>
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20" /> Unavailable</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {slots.length === 0 ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">No slots available yet.</p>
      ) : bookableDateGroups.length === 0 ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">No available dates right now.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {previewDateGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                aria-pressed={activeDateKey === group.key}
                onClick={() => chooseDate(group.key)}
                className="min-w-0 rounded-xl border px-2 py-2 text-left text-xs font-semibold transition-colors"
                style={{
                  borderColor: activeDateKey === group.key ? "var(--primary)" : "var(--border)",
                  backgroundColor: activeDateKey === group.key ? "var(--primary)" : "transparent",
                  color: activeDateKey === group.key ? "white" : "var(--foreground)",
                }}
              >
                {group.label}
                <span className="mt-0.5 block text-[10px] font-medium opacity-75">{group.slots.length} {group.slots.length === 1 ? "time" : "times"}</span>
              </button>
            ))}
          </div>

          <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Available times</p>
          <div className="grid grid-cols-2 gap-2">
            {(activeDateGroup?.slots ?? []).filter((slot) => isBookingSlotAvailable(slot, now)).map((slot) => {
              const selected = slotId === slot.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSlotChange(slot.id)}
                  className="min-w-0 rounded-xl border px-3 py-2.5 text-left transition-colors"
                  style={{
                    borderColor: selected ? "var(--primary)" : "var(--border)",
                    backgroundColor: selected ? "var(--primary)" : "transparent",
                    color: selected ? "white" : "var(--foreground)",
                  }}
                >
                  <span className="block truncate text-sm font-semibold">{formatBookingSlotTime(slot.startsAt)}</span>
                  <span className="mt-0.5 block text-[11px] font-medium opacity-75">{slot.capacity - slot.booked} left</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{availableSlotCount} available {availableSlotCount === 1 ? "time" : "times"} on this date.</p>
        </>
      )}
      {!slotId && availableSlotCount > 0 && <p className="mt-2 text-xs text-destructive">Select a time slot to continue.</p>}
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatBookingSlotTime, getBookingDatePreview, groupBookingSlotsByDate } from "@/lib/customer/booking-slot-presenter";
import type { DetailBodyProps } from "./types";

/**
 * Date + time slot picker. Shared by the categories that book a moment in time
 * (activities, stays); the date state lives here because nothing outside this
 * panel reads it — the cart only needs the chosen slot id.
 */
export function BookingPanel({ activity, slots, slotId, onSlotChange, label }: DetailBodyProps & { label: string }) {
  const slotDateGroups = useMemo(() => groupBookingSlotsByDate(slots), [slots]);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => slotDateGroups[0]?.key ?? "");
  const calendarInputRef = useRef<HTMLInputElement>(null);

  if (!activity.requiresBooking) return null;

  const activeDateKey = slotDateGroups.some((group) => group.key === selectedDateKey) ? selectedDateKey : slotDateGroups[0]?.key ?? "";
  const activeDateGroup = slotDateGroups.find((group) => group.key === activeDateKey);
  const previewDateGroups = getBookingDatePreview(slotDateGroups, activeDateKey);

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="block text-xs font-semibold text-muted-foreground">{label}</label>
        {slotDateGroups.length > 3 && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                const input = calendarInputRef.current;
                if (!input) return;
                try {
                  if (typeof input.showPicker === "function") input.showPicker();
                  else input.click();
                } catch {
                  input.click();
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-secondary"
            >
              <CalendarDays size={13} /> Calendar
            </button>
            <input
              ref={calendarInputRef}
              type="date"
              value={activeDateKey}
              onChange={(event) => {
                const group = slotDateGroups.find((item) => item.key === event.target.value);
                if (!group) return;
                setSelectedDateKey(group.key);
                onSlotChange("");
              }}
              aria-label="Choose another available date"
              className="pointer-events-none absolute h-px w-px opacity-0"
              tabIndex={-1}
            />
          </div>
        )}
      </div>
      {slots.length === 0 ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">No slots available yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {previewDateGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                aria-pressed={activeDateKey === group.key}
                onClick={() => {
                  setSelectedDateKey(group.key);
                  onSlotChange("");
                }}
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
            {(activeDateGroup?.slots ?? []).map((s) => {
              const unavailable = s.status ? s.status !== "available" : s.booked >= s.capacity;
              const full = unavailable || s.booked >= s.capacity;
              const selected = slotId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={unavailable}
                  aria-pressed={selected}
                  onClick={() => onSlotChange(s.id)}
                  className="min-w-0 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed"
                  style={{
                    borderColor: selected ? "var(--primary)" : "var(--border)",
                    backgroundColor: selected ? "var(--primary)" : full ? "var(--muted)" : "transparent",
                    color: selected ? "white" : full ? "var(--muted-foreground)" : "var(--foreground)",
                  }}
                >
                  <span className="block truncate text-sm font-semibold">{formatBookingSlotTime(s.startsAt)}</span>
                  <span className="mt-0.5 block text-[11px] font-medium opacity-75">{full ? "Fully booked" : `${s.capacity - s.booked} left`}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {!slotId && slots.length > 0 && <p className="mt-2 text-xs text-destructive">Select a time slot to continue.</p>}
    </div>
  );
}

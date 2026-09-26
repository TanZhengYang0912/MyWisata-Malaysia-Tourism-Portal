import type { CustomerCalendarEvent } from "@/lib/customer/event-calendar";

export type CustomerCalendarLoadStatus = "idle" | "loading" | "success" | "error";

export type CustomerCalendarUiState = "loading" | "empty" | "error" | "ready";

export function getCustomerCalendarUiState(
  loadStatus: CustomerCalendarLoadStatus,
  eventCount: number,
): CustomerCalendarUiState {
  if (loadStatus === "idle" || loadStatus === "loading") return "loading";
  if (loadStatus === "error") return "error";
  return eventCount > 0 ? "ready" : "empty";
}

export function getEarliestCustomerCalendarEvent(events: CustomerCalendarEvent[]): CustomerCalendarEvent | null {
  return events.reduce<CustomerCalendarEvent | null>((earliest, event) => {
    const start = Date.parse(event.start);
    if (!Number.isFinite(start)) return earliest;

    const earliestStart = earliest ? Date.parse(earliest.start) : Number.POSITIVE_INFINITY;
    return start < earliestStart ? event : earliest;
  }, null);
}

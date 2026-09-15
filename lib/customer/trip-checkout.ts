import type { BookingSlot, ComputedActivity } from "@/backend/core/types";
import type { TripItem } from "@/backend/domains/trips";
import { getActivityCommerceMode } from "@/lib/customer/category-details";
import { groupBookableBookingSlotsByDate } from "@/lib/customer/booking-slot-presenter";

export interface TripCheckoutLine {
  activityId: string;
  /**
   * A booking-only product can have zero variants — the real `CartItem`
   * contract (`assertCartItemHasBackingRecord`) only requires *either* a
   * variant or a slot, so this is "" (never undefined, to match the shape
   * `useCart().addItem` already expects) when the slot alone backs the line.
   */
  variantId: string;
  outletId: string;
  slotId?: string;
  qty: number;
}

export interface TripCheckoutSkip {
  itemId: string;
  label: string;
}

export interface TripCheckoutResolution {
  lines: TripCheckoutLine[];
  /**
   * Requires a real vendor booking slot but none is open on the item's
   * scheduled day — never invented or nudged to a nearby date; left for the
   * customer to pick manually on the activity page.
   */
  needsSlot: TripCheckoutSkip[];
}

function scheduledTimeMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

const SLOT_TIME_OF_DAY_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function slotMinutes(startsAt: string): number {
  const parts = SLOT_TIME_OF_DAY_FORMATTER.formatToParts(new Date(startsAt));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

/**
 * Earliest slot when the item has no time of its own, else the one nearest
 * that time. Never assumes the input is pre-sorted by `starts_at` — grouping
 * by calendar date does not guarantee that.
 */
function pickSlot(slots: BookingSlot[], scheduledTime: string | null): BookingSlot | null {
  if (slots.length === 0) return null;
  const targetMinutes = scheduledTime ? scheduledTimeMinutes(scheduledTime) : 0;
  return slots.reduce((closest, slot) => (
    Math.abs(slotMinutes(slot.startsAt) - targetMinutes) < Math.abs(slotMinutes(closest.startsAt) - targetMinutes) ? slot : closest
  ), slots[0]);
}

/**
 * Resolves a trip's scheduled itinerary into real cart lines. Free/self-guided
 * places (no vendor behind them) are silently skipped — there was never
 * anything to buy. A vendor item that requires booking is only ever matched
 * against a real, currently-open `booking_slots` row for that exact day; when
 * none exists it is reported via `needsSlot` rather than added with a
 * fabricated or shifted slot.
 */
export function resolveTripCheckoutLines(
  scheduledItems: TripItem[],
  activitiesById: Map<string, ComputedActivity>,
  slotsByActivityId: Map<string, BookingSlot[]>,
): TripCheckoutResolution {
  const lines: TripCheckoutLine[] = [];
  const needsSlot: TripCheckoutSkip[] = [];

  for (const item of scheduledItems) {
    if (!item.experience_id) continue;
    const activity = activitiesById.get(item.experience_id);
    if (!activity) continue;
    if (getActivityCommerceMode(activity) !== "vendor") continue;
    const variantId = activity.variants[0]?.id ?? "";

    if (activity.requiresBooking) {
      const dateGroups = groupBookableBookingSlotsByDate(slotsByActivityId.get(activity.id) ?? []);
      const dayGroup = item.scheduled_date ? dateGroups.find((group) => group.key === item.scheduled_date) : undefined;
      const slot = dayGroup ? pickSlot(dayGroup.slots, item.scheduled_time) : null;
      if (!slot) {
        needsSlot.push({ itemId: item.id, label: item.label });
        continue;
      }
      lines.push({ activityId: activity.id, variantId, outletId: activity.outlet.id, slotId: slot.id, qty: 1 });
      continue;
    }

    // No booking slot to fall back on here — a variant is the only possible
    // backing record, so a variant-less non-booking product really is
    // uncartable (matches activity-detail-client.tsx's "cartUnavailable" state).
    if (!variantId) continue;
    lines.push({ activityId: activity.id, variantId, outletId: activity.outlet.id, qty: 1 });
  }

  return { lines, needsSlot };
}

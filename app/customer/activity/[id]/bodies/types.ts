import type { ComponentType } from "react";
import type { BookingSlot, ComputedActivity } from "@/backend/core/types";

/**
 * Props every category body receives. Purchase state that the cart needs
 * (slot, quantity, variant, outlet) stays owned by the shell — a body only
 * renders the part of the panel that its category actually varies.
 */
export interface DetailBodyProps {
  activity: ComputedActivity;
  slots: BookingSlot[];
  slotId: string;
  onSlotChange: (slotId: string) => void;
}

/**
 * One per categories.slug. Add a fifth category by writing one of these and
 * adding a line to the map in ./index.ts — no other category's code changes.
 */
export interface DetailBody {
  /** Kicker above the purchase panel heading. */
  panelKickerKey: string;
  panelTitleKey: (activity: ComputedActivity) => string;
  /** Line in the mobile bar, e.g. "2 persons" / "2 items". */
  quantityLabelKey: string;
  /** Category-specific options between the outlet picker and the quantity row. */
  Options: ComponentType<DetailBodyProps> | null;
}

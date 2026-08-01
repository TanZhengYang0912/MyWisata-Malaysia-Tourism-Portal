"use client";

import { BookingPanel } from "./booking-panel";
import type { DetailBody, DetailBodyProps } from "./types";

function StayOptions(props: DetailBodyProps) {
  return <BookingPanel {...props} label="Choose your check-in date" />;
}

export const stayBody: DetailBody = {
  panelKicker: "Ready to stay",
  panelTitle: (activity) => (activity.requiresBooking ? "Select your dates" : "Choose your room"),
  quantityLabel: (qty) => `${qty} night${qty > 1 ? "s" : ""}`,
  Options: StayOptions,
};

"use client";

import { BookingPanel } from "./booking-panel";
import type { DetailBody, DetailBodyProps } from "./types";

function ActivityOptions(props: DetailBodyProps) {
  return <BookingPanel {...props} label="Choose a date and time" />;
}

export const activityBody: DetailBody = {
  panelKicker: "Ready to book",
  panelTitle: (activity) => (activity.requiresBooking ? "Select your visit" : "Choose your options"),
  quantityLabel: (qty) => `${qty} person${qty > 1 ? "s" : ""}`,
  Options: ActivityOptions,
};

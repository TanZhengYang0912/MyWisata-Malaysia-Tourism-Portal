"use client";

import { BookingPanel } from "./booking-panel";
import { useTranslation } from "react-i18next";
import type { DetailBody, DetailBodyProps } from "./types";

function ActivityOptions(props: DetailBodyProps) {
  const { t } = useTranslation("customer");
  return <BookingPanel {...props} label={t("ui.booking.chooseDateTime")} />;
}

export const activityBody: DetailBody = {
  panelKicker: "Ready to book",
  panelTitle: (activity) => (activity.requiresBooking ? "Select your visit" : "Choose your options"),
  quantityLabel: (qty) => `${qty} person${qty > 1 ? "s" : ""}`,
  Options: ActivityOptions,
};

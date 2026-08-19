"use client";

import { BookingPanel } from "./booking-panel";
import { useTranslation } from "react-i18next";
import type { DetailBody, DetailBodyProps } from "./types";

function StayOptions(props: DetailBodyProps) {
  const { t } = useTranslation("customer");
  return <BookingPanel {...props} label={t("ui.booking.chooseCheckin")} />;
}

export const stayBody: DetailBody = {
  panelKicker: "Ready to stay",
  panelTitle: (activity) => (activity.requiresBooking ? "Select your dates" : "Choose your room"),
  quantityLabel: (qty) => `${qty} night${qty > 1 ? "s" : ""}`,
  Options: StayOptions,
};

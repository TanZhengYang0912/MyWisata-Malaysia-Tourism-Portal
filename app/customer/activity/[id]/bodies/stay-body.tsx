"use client";

import { BookingPanel } from "./booking-panel";
import { useTranslation } from "react-i18next";
import type { DetailBody, DetailBodyProps } from "./types";

function StayOptions(props: DetailBodyProps) {
  const { t } = useTranslation("customer");
  return <BookingPanel {...props} label={t("ui.booking.chooseCheckin")} />;
}

export const stayBody: DetailBody = {
  panelKickerKey: "strictMigration.activityDetail.readyToStay",
  panelTitleKey: (activity) => (activity.requiresBooking ? "strictMigration.activityDetail.selectDates" : "strictMigration.activityDetail.chooseRoom"),
  quantityLabelKey: "strictMigration.activityDetail.nightCount",
  Options: StayOptions,
};

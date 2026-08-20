"use client";

import { BookingPanel } from "./booking-panel";
import { useTranslation } from "react-i18next";
import type { DetailBody, DetailBodyProps } from "./types";

function ActivityOptions(props: DetailBodyProps) {
  const { t } = useTranslation("customer");
  return <BookingPanel {...props} label={t("ui.booking.chooseDateTime")} />;
}

export const activityBody: DetailBody = {
  panelKickerKey: "strictMigration.activityDetail.readyToBook",
  panelTitleKey: (activity) => (activity.requiresBooking ? "strictMigration.activityDetail.selectVisit" : "strictMigration.activityDetail.chooseOptions"),
  quantityLabelKey: "strictMigration.activityDetail.personCount",
  Options: ActivityOptions,
};

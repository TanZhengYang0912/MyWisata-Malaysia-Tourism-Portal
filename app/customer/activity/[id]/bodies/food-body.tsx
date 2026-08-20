"use client";

import type { DetailBody } from "./types";

// A dish is ordered, not booked — no slot picker. The outlet stays named
// (see isPlaceBound): which branch cooks it is exactly what the customer needs.
export const foodBody: DetailBody = {
  panelKickerKey: "strictMigration.activityDetail.readyToOrder",
  panelTitleKey: () => "strictMigration.activityDetail.chooseOptions",
  quantityLabelKey: "strictMigration.activityDetail.itemCount",
  Options: null,
};

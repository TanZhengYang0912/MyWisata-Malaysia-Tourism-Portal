"use client";

import type { DetailBody } from "./types";

// Goods are bought off a shelf. The branch holding the stock is real, so the
// outlet stays named.
export const retailBody: DetailBody = {
  panelKickerKey: "strictMigration.activityDetail.readyToBuy",
  panelTitleKey: () => "strictMigration.activityDetail.chooseOptions",
  quantityLabelKey: "strictMigration.activityDetail.itemCount",
  Options: null,
};

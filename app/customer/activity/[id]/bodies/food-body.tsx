"use client";

import type { DetailBody } from "./types";

// A dish is ordered, not booked — no slot picker. The outlet stays named
// (see isPlaceBound): which branch cooks it is exactly what the customer needs.
export const foodBody: DetailBody = {
  panelKicker: "Ready to order",
  panelTitle: () => "Choose your options",
  quantityLabel: (qty) => `${qty} item${qty > 1 ? "s" : ""}`,
  Options: null,
};

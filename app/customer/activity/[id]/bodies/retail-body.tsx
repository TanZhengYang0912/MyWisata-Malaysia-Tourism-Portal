"use client";

import type { DetailBody } from "./types";

// Goods are bought off a shelf. The branch holding the stock is real, so the
// outlet stays named.
export const retailBody: DetailBody = {
  panelKicker: "Ready to buy",
  panelTitle: () => "Choose your options",
  quantityLabel: (qty) => `${qty} item${qty > 1 ? "s" : ""}`,
  Options: null,
};

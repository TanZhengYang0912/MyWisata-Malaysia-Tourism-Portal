export const TOURISM_THEME = {
  brand: "#010066",
  travelBlue: "#010066",
  malaysiaRed: "#CC0001",
  malaysiaYellow: "#FFCC00",
  natureGreen: "#10B981",
  ctaOrange: "#F97316",
  highlightYellow: "#FFCC00",
  aiPurple: "#7C3AED",
  onCtaOrange: "#0F172A",
  onHighlightYellow: "#010066",
  onNatureGreen: "#062A20",
} as const;

export const TOURISM_PAGE_ROLES = {
  explore: { dominant: "travelBlue", action: "brand" },
  map: { dominant: "travelBlue", action: "travelBlue" },
  detail: { dominant: "brand", action: "brand" },
  checkout: { dominant: "brand", action: "brand" },
} as const;

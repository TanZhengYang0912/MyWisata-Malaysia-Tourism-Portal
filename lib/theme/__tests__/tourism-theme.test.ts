import { describe, expect, it } from "vitest";
import { TOURISM_PAGE_ROLES, TOURISM_THEME } from "../tourism-theme";

describe("tourism theme", () => {
  it("defines semantic colors for the customer travel experience", () => {
    expect(TOURISM_THEME.brand).toBe("#010066");
    expect(TOURISM_THEME.travelBlue).toBe("#010066");
    expect(TOURISM_THEME.malaysiaRed).toBe("#CC0001");
    expect(TOURISM_THEME.malaysiaYellow).toBe("#FFCC00");
    expect(TOURISM_THEME.natureGreen).toBe("#10B981");
    expect(TOURISM_THEME.highlightYellow).toBe("#FFCC00");
    expect(TOURISM_THEME.aiPurple).toBe("#7C3AED");
  });

  it("uses dark text for bright action and highlight surfaces", () => {
    expect(TOURISM_THEME.onCtaOrange).toBe("#0F172A");
    expect(TOURISM_THEME.onHighlightYellow).toBe("#010066");
    expect(TOURISM_THEME.onNatureGreen).toBe("#062A20");
  });

  it("keeps each customer page to one dominant color and one action color", () => {
    expect(TOURISM_PAGE_ROLES.explore).toEqual({ dominant: "travelBlue", action: "brand" });
    expect(TOURISM_PAGE_ROLES.map).toEqual({ dominant: "travelBlue", action: "travelBlue" });
    expect(TOURISM_PAGE_ROLES.detail).toEqual({ dominant: "brand", action: "brand" });
    expect(TOURISM_PAGE_ROLES.checkout).toEqual({ dominant: "brand", action: "brand" });
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TOURISM_PAGE_ROLES, TOURISM_THEME } from "../tourism-theme";

const workspace = resolve(__dirname, "../../..");

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

  it("keeps shared brand surfaces blue instead of green-tinted", () => {
    const globals = readFileSync(resolve(workspace, "app/globals.css"), "utf8");
    const outletPage = readFileSync(resolve(workspace, "app/customer/outlet/[outletId]/page.tsx"), "utf8");
    const salesChart = readFileSync(resolve(workspace, "components/vendor/sales-chart.tsx"), "utf8");
    const dashboard = readFileSync(resolve(workspace, "lib/vendor-dashboard.ts"), "utf8");

    expect(globals).toContain("--muted-foreground: #64748b;");
    expect(globals).toContain("--border: rgba(1, 0, 102, 0.12);");
    expect(outletPage).not.toMatch(/emerald-|#0d5c4a|#15332c|#f8faf8/);
    expect(salesChart).not.toContain("#0f766e");
    expect(dashboard).not.toMatch(/#0f766e|#0e7490/);
  });
});

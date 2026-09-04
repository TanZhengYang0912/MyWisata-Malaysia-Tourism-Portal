import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/shared/affiliate-insight-card.tsx"),
  "utf8",
);

describe("AffiliateInsightCard provider boundary", () => {
  it("keeps the customer capability hook inside the customer-only wrapper", () => {
    const contentStart = source.indexOf("function AffiliateInsightCardContent");
    const cardStart = source.indexOf("export function AffiliateInsightCard");
    const content = source.slice(contentStart, cardStart);

    expect(contentStart).toBeGreaterThanOrEqual(0);
    expect(source).toContain("function GatedAffiliateInsightCard");
    expect(content).not.toContain("useCustomerCapabilityGate()");
    expect(source).toMatch(/if \(props\.scope === "user"\)[\s\S]*GatedAffiliateInsightCard/);
  });
});

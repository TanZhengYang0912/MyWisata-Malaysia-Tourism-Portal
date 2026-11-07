import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/customer/for-you/for-you-client.tsx"), "utf8");

describe("For You discovery layout contract", () => {
  it("uses the shared Home product card and four-column discovery grid", () => {
    expect(source).toContain("from '@/components/customer/activity-card'");
    expect(source).toContain("grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4");
    expect(source).not.toContain("md:grid-cols-3");
    expect(source).toContain("<ActivityCard");
  });

  it("keeps grouped recommendations without adding rationale copy to listing cards", () => {
    expect(source).toContain("groupRankedByProperty(result.activities)");
    expect(source).not.toContain("recommendationReason");
    expect(source).not.toContain("composeReasonText");
    expect(source).toContain("whyItFits");
  });

  it("provides a visible route back to the customer home", () => {
    expect(source).toContain('href="/customer"');
    expect(source).toContain("t('ui.forYou.backHome')");
    expect(source).toContain("ArrowLeft");
  });
});

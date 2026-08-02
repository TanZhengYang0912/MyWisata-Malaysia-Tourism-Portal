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

  it("keeps personalized recommendation context on the shared card", () => {
    expect(source).toContain("recommendationReason");
    expect(source).toContain("whyItFits");
  });
});

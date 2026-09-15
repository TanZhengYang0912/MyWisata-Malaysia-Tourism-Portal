import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/vendor/voucher-metric-card.tsx"),
  "utf8",
);

describe("VoucherMetricCard", () => {
  it("defines a reusable semantic metric card shell", () => {
    expect(source).toContain("export function VoucherMetricCard");
    expect(source).toContain("data-voucher-metric");
    expect(source).toContain("bg-card");
    expect(source).toContain("border-border");
  });
});

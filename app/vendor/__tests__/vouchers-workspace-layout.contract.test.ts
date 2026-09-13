import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/vendor/vouchers/page.tsx"), "utf8");
const metricSource = readFileSync(
  resolve(process.cwd(), "components/vendor/voucher-metric-card.tsx"),
  "utf8",
);

describe("vendor voucher management workspace", () => {
  it("keeps the voucher list ahead of the owner performance detail", () => {
    expect(source).toContain('data-voucher-workspace="filters"');
    expect(source).toContain('data-voucher-workspace="list"');
    expect(source).toContain('data-voucher-workspace="performance"');
    expect(source.indexOf('data-voucher-workspace="list"')).toBeLessThan(
      source.indexOf('data-voucher-workspace="performance"'),
    );
  });

  it("uses the reusable compact metric treatment rather than oversized cards", () => {
    expect(source).toContain('density="compact"');
    expect(metricSource).toContain('density?: "comfortable" | "compact"');
    expect(metricSource).toContain('density === "compact"');
  });
});

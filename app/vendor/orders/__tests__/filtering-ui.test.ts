import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "app/vendor/orders/page.tsx"),
  "utf8",
);
const apiSource = readFileSync(
  resolve(process.cwd(), "app/api/vendors/[vendorId]/orders/route.ts"),
  "utf8",
);

describe("vendor order filtering UI", () => {
  it("keeps the default toolbar simple and exposes advanced filters on demand", () => {
    expect(pageSource).toContain('import { VendorListFilters } from "@/components/vendor/vendor-list-filters"');
    expect(pageSource).toContain('<VendorListFilters');
    expect(pageSource).toContain("filtersOpen");
    expect(pageSource).toContain('onApply={applyAdvancedFilters}');
    expect(pageSource).toContain('t("ui.orders.needsAttention")');
    expect(pageSource).toContain('t("ui.orders.applyFilters")');
    expect(pageSource).toContain('setDraftFilters((current) => ({ ...current, fulfilStatus }))');
    expect(pageSource).toContain('t("ui.orders.allOrders")');
  });

  it("lets the needs-attention shortcut cover pending and ready fulfilment", () => {
    expect(apiSource).toMatch(
      /fulfilStatus === ['"]attention['"][\s\S]+\.in\(['"]order_items\.fulfil_status['"], \[['"]pending['"], ['"]ready['"]\]\)/,
    );
  });
});

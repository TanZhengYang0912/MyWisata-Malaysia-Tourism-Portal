import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ordersSource = readFileSync(resolve(process.cwd(), "app/customer/orders/page.tsx"), "utf8");

describe("customer orders-first layout", () => {
  it("keeps order metrics compact instead of rendering three large cards", () => {
    expect(ordersSource).toContain("stats.total");
    expect(ordersSource).toContain("stats.paid");
    expect(ordersSource).toContain("stats.bookings");
    expect(ordersSource).not.toContain("grid gap-3 sm:grid-cols-3");
  });

  it("collapses advanced order filters into a closed drawer by default", () => {
    expect(ordersSource).toContain("const [filtersOpen, setFiltersOpen] = useState(false)");
    expect(ordersSource).toContain("<Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>");
    expect(ordersSource).toContain('id="order-filters"');
  });

  it("uses the shared discovery toolbar for search and filters", () => {
    expect(ordersSource).toContain("<DiscoveryToolbar");
    expect(ordersSource).toContain("maxLength={200}");
    expect(ordersSource).toContain("filterCount={activeFilterCount}");
  });
});

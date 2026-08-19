import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ordersSource = readFileSync(resolve(process.cwd(), "components/customer/customer-orders-view.tsx"), "utf8");

describe("customer orders-first layout", () => {
  it("keeps order metrics compact instead of rendering three large cards", () => {
    expect(ordersSource).toContain("stats.total");
    expect(ordersSource).toContain("stats.paid");
    expect(ordersSource).toContain("stats.bookings");
    expect(ordersSource).not.toContain("grid gap-3 sm:grid-cols-3");
  });

  it("collapses advanced order filters by default", () => {
    expect(ordersSource).toContain("const [filtersOpen, setFiltersOpen] = useState(false)");
    expect(ordersSource).toContain("aria-expanded={filtersOpen}");
    expect(ordersSource).toContain('aria-controls="order-filters"');
    expect(ordersSource).toContain('id="order-filters"');
    expect(ordersSource).toContain("Filters");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const bookingsSource = readFileSync(resolve(process.cwd(), "app/vendor/bookings/page.tsx"), "utf8");
const productsSource = readFileSync(resolve(process.cwd(), "app/vendor/products/page.tsx"), "utf8");
const vouchersSource = readFileSync(resolve(process.cwd(), "app/vendor/vouchers/page.tsx"), "utf8");

describe("Vendor command palette action routes", () => {
  it("opens the booking slot form from its create shortcut", () => {
    expect(bookingsSource).toContain("useSearchParams");
    expect(bookingsSource).toMatch(/searchParams\.get\(["']create["']\)/);
    expect(bookingsSource).toContain("setShowSlotForm(true)");
  });

  it("opens product creation only for outlet managers", () => {
    expect(productsSource).toContain("useSearchParams");
    expect(productsSource).toMatch(/searchParams\.get\(['"]create['"]\)/);
    expect(productsSource).toContain("if (canManageOutlet)");
    expect(productsSource).toContain("setShowForm(true)");
    expect(productsSource).toContain("{canManageOutlet && (showForm || editingProduct)");
  });

  it("opens voucher creation from its create shortcut", () => {
    expect(vouchersSource).toContain("useSearchParams");
    expect(vouchersSource).toContain("searchParams.get('create') === '1'");
    expect(vouchersSource).toContain("if (requestedCreate && vendorId) setShowForm(true)");
  });
});

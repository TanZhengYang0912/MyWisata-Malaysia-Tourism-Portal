import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const bookingsSource = readFileSync(resolve(process.cwd(), "app/vendor/bookings/page.tsx"), "utf8");

describe("Vendor command palette action routes", () => {
  it("opens the booking slot form from its create shortcut", () => {
    expect(bookingsSource).toContain("useSearchParams");
    expect(bookingsSource).toMatch(/searchParams\.get\(["']create["']\)/);
    expect(bookingsSource).toContain("setShowSlotForm(true)");
  });
});

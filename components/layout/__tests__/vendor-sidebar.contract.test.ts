import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getVendorNavigationSections } from "@/lib/vendor/navigation";

const source = readFileSync(resolve(process.cwd(), "components/layout/vendor-sidebar.tsx"), "utf8");
const gateSource = readFileSync(resolve(process.cwd(), "components/layout/vendor-access-gate.tsx"), "utf8");

describe("Outlet Manager navigation", () => {
  it("uses the shared role-specific navigation source consumed by the command palette", () => {
    expect(source).toContain("getVendorNavigationSections(isOutletManager)");
    expect(source).not.toContain("const OUTLET_MANAGER_SECTIONS");
    expect(getVendorNavigationSections(false).flatMap((section) => section.items.map((item) => item.href))).toEqual([
      "/vendor/dashboard",
      "/vendor/outlets",
      "/vendor/profile",
      "/vendor/products",
      "/vendor/bookings",
      "/vendor/redemptions",
      "/vendor/vouchers",
      "/vendor/orders",
      "/vendor/wallet",
      "/vendor/inbox",
      "/vendor/analytics",
    ]);
    expect(getVendorNavigationSections(true).flatMap((section) => section.items.map((item) => item.href))).toEqual([
      "/vendor/dashboard",
      "/vendor/outlets?mode=shop",
      "/vendor/products",
      "/vendor/bookings",
      "/vendor/scanner",
      "/vendor/vouchers",
      "/vendor/orders",
      "/vendor/inbox",
      "/vendor/analytics",
    ]);
  });

  it("exposes the existing voucher workspace and analytics insights", () => {
    expect(source).toContain("@/lib/vendor/navigation");
    expect(gateSource).toContain("'/vendor/vouchers'");
    expect(gateSource).toContain("'/vendor/analytics'");
  });
});

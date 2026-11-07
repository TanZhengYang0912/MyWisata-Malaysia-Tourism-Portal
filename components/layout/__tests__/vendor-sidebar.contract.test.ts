import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getVendorNavigationSections } from "@/lib/vendor/navigation";

const source = readFileSync(resolve(process.cwd(), "components/layout/vendor-sidebar.tsx"), "utf8");
const gateSource = readFileSync(resolve(process.cwd(), "components/layout/vendor-access-gate.tsx"), "utf8");

describe("Outlet Manager navigation", () => {
  it("uses the shared role-specific navigation source consumed by the command palette", () => {
    expect(source).toContain("getVendorNavigationSections(isOutletManager, isEventVendor)");
    expect(source).not.toContain("const OUTLET_MANAGER_SECTIONS");
    expect(getVendorNavigationSections(false).flatMap((section) => section.items.map((item) => item.href))).toEqual([
      "/vendor/announcements",
      "/vendor/inbox",
      "/vendor/dashboard",
      "/vendor/outlets",
      "/vendor/profile",
      "/vendor/products",
      "/vendor/bookings",
      "/vendor/redemptions",
      "/vendor/vouchers",
      "/vendor/orders",
      "/vendor/wallet",
      "/vendor/analytics",
      "/vendor/event-promotions",
      "/vendor/events",
      "/vendor/event-orders",
    ]);
    expect(getVendorNavigationSections(true).flatMap((section) => section.items.map((item) => item.href))).toEqual([
      "/vendor/announcements",
      "/vendor/inbox",
      "/vendor/dashboard",
      "/vendor/outlets?mode=shop",
      "/vendor/products",
      "/vendor/bookings",
      "/vendor/scanner",
      "/vendor/vouchers",
      "/vendor/orders",
      "/vendor/analytics",
    ]);
    // Event vendors: events, payouts and invitations only — no shop pages.
    expect(getVendorNavigationSections(false, true).flatMap((section) => section.items.map((item) => item.href))).toEqual([
      "/vendor/announcements",
      "/vendor/events",
      "/vendor/event-orders",
      "/vendor/scanner",
      "/vendor/wallet",
    ]);
  });

  it("only lists outlet manager pages the access gate lets them open", () => {
    const allowed = gateSource.match(/OUTLET_MANAGER_PATHS = \[([\s\S]*?)\]/)![1].match(/'\/vendor\/[^']+'/g)!.map((path) => path.slice(1, -1));
    for (const section of getVendorNavigationSections(true)) {
      for (const item of section.items) {
        const path = item.href.split("?")[0];
        expect(allowed, `${path} is in the sidebar but blocked by the gate`).toContain(path);
      }
    }
  });

  it("exposes the existing voucher workspace and analytics insights", () => {
    expect(source).toContain("@/lib/vendor/navigation");
    expect(gateSource).toContain("'/vendor/vouchers'");
    expect(gateSource).toContain("'/vendor/analytics'");
  });

  it("leaves category headings to the shared uniform sidebar presentation", () => {
    expect(source).not.toContain("emphasis: section.labelKey === 'workspace' ? 'primary' : undefined");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(resolve(process.cwd(), "app/customer/layout.tsx"), "utf8");
const headerNavigationSource = readFileSync(resolve(process.cwd(), "lib/customer/header-navigation.ts"), "utf8");
const mobileRowStart = layoutSource.indexOf("{/* Responsive secondary row");
const mobileRow = layoutSource.slice(mobileRowStart, layoutSource.indexOf("</nav>", mobileRowStart));

describe("customer mobile navigation", () => {
  it("does not duplicate My Vouchers outside the account menu", () => {
    expect(mobileRowStart).toBeGreaterThanOrEqual(0);
    expect(mobileRow).not.toContain('href="/customer/vouchers"');
    expect(headerNavigationSource).toContain('href: "/customer/vouchers"');
  });

  it("renders the same shared five destinations on mobile without mobile-only counters", () => {
    expect(mobileRow).toContain('<CustomerPrimaryNavigation pathname={pathname} layout="stacked" />');
    expect(mobileRow).not.toContain("tripCount");
    expect(mobileRow).not.toContain('href="/customer/saved"');
  });

  it("keeps the mobile nav horizontally scrollable", () => {
    expect(mobileRow).toContain("overflow-x-auto");
  });
});

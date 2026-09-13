import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/layout/vendor-sidebar.tsx"), "utf8");
const gateSource = readFileSync(resolve(process.cwd(), "components/layout/vendor-access-gate.tsx"), "utf8");

describe("Outlet Manager navigation", () => {
  it("exposes the existing voucher workspace and analytics insights", () => {
    const managerSection = source.slice(source.indexOf("const OUTLET_MANAGER_SECTIONS"));
    expect(managerSection).toContain("{ href: '/vendor/vouchers', label: 'Vouchers'");
    expect(gateSource).toContain("'/vendor/vouchers'");
    expect(managerSection).toContain("{ href: '/vendor/analytics', label: 'Analytics'");
    expect(gateSource).toContain("'/vendor/analytics'");
  });
});

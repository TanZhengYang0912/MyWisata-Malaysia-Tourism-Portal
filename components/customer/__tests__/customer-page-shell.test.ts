import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const shellSource = readFileSync(resolve(workspace, "components/customer/customer-page-shell.tsx"), "utf8");
const requestedRoutes = [
  "app/customer/profile/page.tsx",
  "app/customer/notifications/page.tsx",
  "app/customer/preferences/page.tsx",
  "app/customer/wallet/page.tsx",
  "app/customer/kyc/page.tsx",
  "app/customer/support/page.tsx",
  "app/customer/affiliate/page.tsx",
  "app/customer/profile/register-vendor/page.tsx",
  "app/customer/recommendations/page.tsx",
];

describe("customer page dimensions", () => {
  it("defines the shared responsive page frame and panel scale", () => {
    expect(shellSource).toContain("max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8");
    expect(shellSource).toContain("max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10");
    expect(shellSource).toContain("export function CustomerPageTitle");
    expect(shellSource).toContain("export function CustomerPageHeader");
    expect(shellSource).toContain("text-3xl font-bold leading-tight tracking-tight");
    expect(shellSource).toContain("rounded-2xl border border-border bg-card");
    expect(shellSource).toContain("p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)] sm:p-6");
  });

  it("uses the shared page frame on every requested customer route", () => {
    for (const route of requestedRoutes) {
      const source = readFileSync(resolve(workspace, route), "utf8");
      expect(source, route).toContain("CustomerPageShell");
      expect(source, route).toContain("CustomerPageTitle");
    }
  });
});

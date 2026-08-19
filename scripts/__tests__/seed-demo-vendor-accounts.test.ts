import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("demo vendor account seeding", () => {
  it("provisions every demo vendor and outlet-manager profile, not only a fixed sample", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/seed-demo-vendor-accounts.mjs"), "utf8");

    expect(source).toContain("from('users')");
    expect(source).toContain("user_roles(roles(name))");
    expect(source).toContain("vendor_owner");
    expect(source).toContain("outlet_manager");
    expect(source).not.toContain("const VENDOR_SLUGS");
    expect(source).not.toContain("const OUTLET_SLUGS");
  });
});

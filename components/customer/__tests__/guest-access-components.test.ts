import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("guest access components", () => {
  const gate = readFileSync(new URL("../use-customer-capability-gate.ts", import.meta.url), "utf8");
  const empty = readFileSync(new URL("../guest-account-empty-state.tsx", import.meta.url), "utf8");
  const login = readFileSync(new URL("../../../app/login/page.tsx", import.meta.url), "utf8");

  it("routes blocked actions through the central policy", () => {
    expect(gate).toContain("resolveCustomerAccess");
    expect(gate).toContain("customerAccessHref");
    expect(gate).toContain("return false");
  });

  it("offers sign in and account creation with the same continuation", () => {
    expect(empty).toContain("Sign in");
    expect(empty).toContain("Create account");
    expect(empty).toContain("mode=signup");
    expect(login).toContain('searchParams.get("mode") === "signup"');
  });
});

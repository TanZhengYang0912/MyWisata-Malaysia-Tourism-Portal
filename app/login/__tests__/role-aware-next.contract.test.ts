import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("role-aware login destinations", () => {
  it("resolves password and OTP destinations only after the account role is known", () => {
    const page = readFileSync(resolve(process.cwd(), "app/login/page.tsx"), "utf8");

    expect(page).toContain("const signedInUser = await refreshUser()");
    expect(page).toContain("postLoginDestination(");
    expect(page).toContain('requestedNext("customer")');
  });
});

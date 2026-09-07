import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("../layout.tsx", import.meta.url), "utf8");

describe("staff invitation acceptance page", () => {
  it("reviews permissions and uses the fixed invited email", () => {
    expect(source).toContain("invitation.permissions.map");
    expect(source).toContain("readOnly");
    expect(source).toContain("invitation.email");
  });

  it("supports password registration, Google, verification, account switching, and explicit acceptance", () => {
    expect(source).toContain("signUp");
    expect(source).toContain("signInWithPassword");
    expect(source).toContain("signInWithOAuth");
    expect(source).toContain("resend");
    expect(source).toContain("signOut");
    expect(source).toMatch(/method:\s*["']POST["']/);
  });

  it("returns the recipient to the invitation after auth and redirects accepted staff to /staff", () => {
    expect(source).toContain("/auth/callback?next=");
    expect(source).toContain('router.push("/staff")');
  });

  it("prevents the token-bearing document URL from being sent as a referrer or indexed", () => {
    expect(layoutSource).toContain('referrer: "no-referrer"');
    expect(layoutSource).toContain("index: false");
  });
});

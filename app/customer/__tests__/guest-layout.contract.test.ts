import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync(new URL("../layout.tsx", import.meta.url), "utf8");

describe("customer layout guest contract", () => {
  it("keeps the customer shell available without an authenticated user", () => {
    expect(layout).toContain("useAuth");
    expect(layout).not.toContain('useRequireRole(["customer"])');
    expect(layout).toContain("Guest");
    expect(layout).toContain("Create account");
    expect(layout).toContain("enabled={Boolean(currentUser)}");
  });

  it("keeps account destinations discoverable for guests", () => {
    expect(layout).toContain("ACCOUNT_MENU_GROUPS");
    expect(layout).toContain('aria-label={`Open ${customerDisplayName} account menu`}');
    expect(layout).toContain("guestLoginHref");
  });
});

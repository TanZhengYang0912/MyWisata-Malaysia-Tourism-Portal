import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("customer account switch", () => {
  it("signs out the current session before navigating to login", () => {
    const layout = readFileSync(
      resolve(process.cwd(), "app/customer/layout.tsx"),
      "utf8",
    );

    expect(layout).toContain("await supabase.auth.signOut()");
    expect(layout).toContain('window.location.assign("/login")');
  });
});

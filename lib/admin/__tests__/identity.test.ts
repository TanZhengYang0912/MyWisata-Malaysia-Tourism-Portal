import { describe, expect, it } from "vitest";
import { getAdminUserLabel } from "@/lib/admin/identity";

describe("getAdminUserLabel", () => {
  it("prefers the full name and then display name", () => {
    expect(getAdminUserLabel({ fullName: "Aisha Lim", displayName: "Aisha", email: "aisha@example.com" })).toBe("Aisha Lim");
    expect(getAdminUserLabel({ fullName: null, displayName: "Aisha", email: "aisha@example.com" })).toBe("Aisha");
  });

  it("uses an identifiable email label when profile names are missing", () => {
    expect(getAdminUserLabel({ fullName: null, displayName: null, email: "mock_cf_7@seed.local" })).toBe("mock_cf_7");
  });
});

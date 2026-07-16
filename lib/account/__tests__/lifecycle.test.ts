import { describe, expect, it } from "vitest";
import { accountGate, canSuspendedAccessPath, restoreTier } from "@/lib/account/lifecycle";

describe("account lifecycle", () => {
  it("routes deleted users to restoration and suspended users to support", () => {
    expect(accountGate("deleted")).toBe("restore");
    expect(accountGate("suspended")).toBe("suspended");
    expect(accountGate("active")).toBe("allow");
  });

  it("restores an email-verified account at the email tier", () => {
    expect(restoreTier(true)).toBe("email_verified");
    expect(restoreTier(false)).toBe("email_unverified");
  });

  it("only allows suspended users to view the suspension and support paths", () => {
    expect(canSuspendedAccessPath("/account-suspended")).toBe(true);
    expect(canSuspendedAccessPath("/customer/support")).toBe(true);
    expect(canSuspendedAccessPath("/customer/support/ticket-1")).toBe(true);
    expect(canSuspendedAccessPath("/customer/wallet")).toBe(false);
  });
});

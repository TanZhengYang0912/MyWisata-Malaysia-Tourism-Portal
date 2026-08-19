import { describe, expect, it } from "vitest";
import { buildVoucherUseHref, getClaimLabel, isClaimUsable } from "@/lib/customer/voucher-claims";

describe("customer voucher claim helpers", () => {
  it("uses distinct labels for claim, claimed, and redeemed states", () => {
    expect(getClaimLabel()).toBe("Claim");
    expect(getClaimLabel("claimed")).toBe("Claimed");
    expect(getClaimLabel("redeemed")).toBe("Redeemed");
  });

  it("only allows a claimed voucher before its expiry", () => {
    const now = new Date("2026-08-16T10:00:00.000Z");
    expect(isClaimUsable({ status: "claimed", expiresAt: "2026-08-17T10:00:00.000Z", now })).toBe(true);
    expect(isClaimUsable({ status: "claimed", expiresAt: "2026-08-15T10:00:00.000Z", now })).toBe(false);
    expect(isClaimUsable({ status: "redeemed", expiresAt: "2026-08-17T10:00:00.000Z", now })).toBe(false);
  });

  it("encodes the voucher code and claim ID in a cart deep link", () => {
    expect(buildVoucherUseHref("WELCOME 10", "claim/123")).toBe("/customer/cart?voucher=WELCOME%2010&claim=claim%2F123");
  });
});

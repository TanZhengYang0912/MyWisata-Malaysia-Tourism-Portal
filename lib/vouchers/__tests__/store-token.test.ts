import { describe, expect, it } from "vitest";
import { signVoucherStoreToken, verifyVoucherStoreToken, voucherTokenFingerprint } from "@/lib/vouchers/store-token";

describe("voucher store token", () => {
  it("round-trips a signed claim token and rejects tampering", () => {
    const token = signVoucherStoreToken(
      { claimId: "claim-1", voucherId: "voucher-1", outletId: "outlet-1", exp: 2_000_000_000 },
      "test-secret",
    );

    expect(verifyVoucherStoreToken(token, "test-secret", 1_000_000_000)).toMatchObject({
      valid: true,
      payload: { kind: "voucher_claim", claimId: "claim-1", voucherId: "voucher-1", outletId: "outlet-1" },
    });
    expect(verifyVoucherStoreToken(`${token}x`, "test-secret", 1_000_000_000).valid).toBe(false);
    expect(voucherTokenFingerprint(token)).toHaveLength(64);
  });
});

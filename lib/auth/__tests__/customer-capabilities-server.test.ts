import { describe, expect, it, vi } from "vitest";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import { CAPABILITY_KEYS } from "@/lib/entitlements/types";

const mocks = vi.hoisted(() => ({
  resolveEffectiveCapability: vi.fn(),
}));

vi.mock("@/lib/entitlements/server", () => ({
  resolveEffectiveCapability: mocks.resolveEffectiveCapability,
}));
import {
  customerCapabilityFailure,
  resolveServerCustomerCapabilities,
  resolveServerCustomerCapability,
} from "@/lib/auth/customer-capabilities.server";

describe("server customer capability resolver", () => {
  it("uses the governed resolver rather than a browser or legacy tier state", async () => {
    mocks.resolveEffectiveCapability.mockResolvedValue({
      capability: "commerce.checkout",
      allowed: false,
      blockerCode: "PHONE_VERIFICATION_REQUIRED",
      qualificationPaths: [{ type: "phone", href: "/customer/profile" }],
      entitlementGeneration: 11,
      source: "hard_guard",
    });

    await expect(resolveServerCustomerCapability("user-1", CUSTOMER_CAPABILITY.CHECKOUT)).resolves.toMatchObject({
      blockerCode: "PHONE_VERIFICATION_REQUIRED",
      entitlementGeneration: 11,
    });
    expect(mocks.resolveEffectiveCapability).toHaveBeenCalledWith("user-1", "commerce.checkout");
  });

  it("fails closed when an old tier-only server adapter input is supplied", () => {
    expect(resolveServerCustomerCapability({
      tier: "kyc_verified",
      kycStatus: "approved",
      roles: ["customer", "vendor_owner"],
    }, CUSTOMER_CAPABILITY.AFFILIATE_FULL)).toMatchObject({
      allowed: false,
      blockerCode: "POLICY_UNAVAILABLE",
      entitlementGeneration: 0,
    });
  });

  it("collects a snapshot from the governed resolver", async () => {
    mocks.resolveEffectiveCapability.mockResolvedValue({
      capability: "commerce.checkout",
      allowed: true,
      blockerCode: null,
      qualificationPaths: [],
      entitlementGeneration: 12,
      source: "policy",
    });
    const snapshot = await resolveServerCustomerCapabilities("user-1");
    expect(snapshot["commerce.checkout"]).toMatchObject({ allowed: true, entitlementGeneration: 12 });
  });

  it("retries a mixed-generation snapshot and only returns coherent canonical decisions", async () => {
    mocks.resolveEffectiveCapability.mockClear();
    let call = 0;
    mocks.resolveEffectiveCapability.mockImplementation(async (_userId: string, capability: string) => {
      const pass = Math.floor(call++ / CAPABILITY_KEYS.length);
      const generation = pass === 0 && capability === "commerce.checkout" ? 2 : pass === 0 ? 1 : 3;
      return {
        capability,
        allowed: true,
        blockerCode: null,
        qualificationPaths: [],
        entitlementGeneration: generation,
        source: "policy",
      };
    });

    const snapshot = await resolveServerCustomerCapabilities("user-1");

    expect(CAPABILITY_KEYS.map((capability) => snapshot[capability]?.entitlementGeneration))
      .toEqual(Array(CAPABILITY_KEYS.length).fill(3));
    expect(snapshot.checkout).toBe(snapshot["commerce.checkout"]);
    expect(mocks.resolveEffectiveCapability).toHaveBeenCalledTimes(CAPABILITY_KEYS.length * 2);
  });

  it("fails the whole snapshot closed when a retry remains mixed", async () => {
    let call = 0;
    mocks.resolveEffectiveCapability.mockImplementation(async (_userId: string, capability: string) => ({
      capability,
      allowed: true,
      blockerCode: null,
      qualificationPaths: [],
      entitlementGeneration: (++call % 2) + 4,
      source: "policy",
    }));

    const snapshot = await resolveServerCustomerCapabilities("user-1");

    expect(CAPABILITY_KEYS.map((capability) => snapshot[capability]))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ allowed: false, blockerCode: "POLICY_UNAVAILABLE", entitlementGeneration: 5 }),
      ]));
    expect(CAPABILITY_KEYS.every((capability) => snapshot[capability]?.entitlementGeneration === 5)).toBe(true);
  });

  it("serializes typed recovery paths and the resolver generation into the API envelope", async () => {
    const decision = {
      capability: "recommendation.submit" as const,
      allowed: false,
      blockerCode: "PROFILE_OR_KYC_REQUIRED" as const,
      qualificationPaths: [
        { type: "profile" as const, href: "/customer/profile" },
        { type: "kyc" as const, href: "/customer/kyc" },
      ],
      entitlementGeneration: 13,
      source: "hard_guard" as const,
      currentTier: null,
      requiredTier: null,
      nextAction: "complete_profile" as const,
    };
    const response = customerCapabilityFailure(
      CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT,
      decision,
      "Profile completion or KYC is required before submitting a recommendation",
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      data: null,
      error: {
        code: "PROFILE_OR_KYC_REQUIRED",
        message: "Profile completion or KYC is required before submitting a recommendation",
        details: {
          capability: "recommendation.submit",
          blockerCode: "PROFILE_OR_KYC_REQUIRED",
          qualificationPaths: [
            { type: "profile", href: "/customer/profile" },
            { type: "kyc", href: "/customer/kyc" },
          ],
          entitlementGeneration: 13,
        },
      },
    });
  });
});

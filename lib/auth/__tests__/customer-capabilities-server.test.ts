import { describe, expect, it, vi } from "vitest";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import { CAPABILITY_KEYS } from "@/lib/entitlements/types";

const mocks = vi.hoisted(() => ({
  resolveEffectiveCapability: vi.fn(),
  resolveEffectiveCapabilities: vi.fn(),
}));

vi.mock("@/lib/entitlements/server", () => ({
  resolveEffectiveCapability: mocks.resolveEffectiveCapability,
  resolveEffectiveCapabilities: mocks.resolveEffectiveCapabilities,
}));
import {
  customerCapabilityFailure,
  resolveServerCustomerCapabilities,
  resolveServerCustomerCapability,
} from "@/lib/auth/customer-capabilities.server";

function decisionsFor(generationFor: (capability: (typeof CAPABILITY_KEYS)[number]) => number) {
  return new Map(CAPABILITY_KEYS.map((capability) => [capability, {
    capability,
    allowed: true,
    blockerCode: null,
    qualificationPaths: [],
    entitlementGeneration: generationFor(capability),
    source: "policy",
  }]));
}

describe("server customer capability resolver", () => {
  it("uses the governed resolver rather than a browser or legacy tier state", async () => {
    mocks.resolveEffectiveCapability.mockResolvedValue({
      capability: "commerce.checkout",
      allowed: false,
      blockerCode: "PHONE_VERIFICATION_REQUIRED",
      qualificationPaths: [{ type: "phone", href: "/customer/phone" }],
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
    mocks.resolveEffectiveCapabilities.mockResolvedValue(decisionsFor(() => 12));
    const snapshot = await resolveServerCustomerCapabilities("user-1");
    expect(snapshot["commerce.checkout"]).toMatchObject({ allowed: true, entitlementGeneration: 12 });
    expect(mocks.resolveEffectiveCapabilities).toHaveBeenCalledWith("user-1", CAPABILITY_KEYS);
  });

  it("retries a mixed-generation snapshot and only returns coherent canonical decisions", async () => {
    mocks.resolveEffectiveCapabilities.mockClear();
    mocks.resolveEffectiveCapabilities
      .mockResolvedValueOnce(decisionsFor((capability) => capability === "commerce.checkout" ? 2 : 1))
      .mockResolvedValueOnce(decisionsFor(() => 3));

    const snapshot = await resolveServerCustomerCapabilities("user-1");

    expect(CAPABILITY_KEYS.map((capability) => snapshot[capability]?.entitlementGeneration))
      .toEqual(Array(CAPABILITY_KEYS.length).fill(3));
    expect(snapshot.checkout).toBe(snapshot["commerce.checkout"]);
    expect(mocks.resolveEffectiveCapabilities).toHaveBeenCalledTimes(2);
  });

  it("fails the whole snapshot closed when a retry remains mixed", async () => {
    const mixedSnapshot = () => decisionsFor((capability) => CAPABILITY_KEYS.indexOf(capability) % 2 + 4);
    mocks.resolveEffectiveCapabilities.mockResolvedValueOnce(mixedSnapshot()).mockResolvedValueOnce(mixedSnapshot());

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

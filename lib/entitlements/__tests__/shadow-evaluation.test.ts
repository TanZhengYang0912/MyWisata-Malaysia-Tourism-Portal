import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  compareShadowEvaluation,
  type ApprovedShadowTransition,
} from "@/lib/entitlements/shadow-evaluation";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const HASH_SECRET = "shadow-hash-secret-that-is-at-least-32-bytes";

function compare(overrides: Partial<Parameters<typeof compareShadowEvaluation>[0]> = {}) {
  return compareShadowEvaluation({
    userId: USER_ID,
    capability: "recommendation.submit",
    legacyAllowed: false,
    entitlementAllowed: true,
    entitlementGeneration: 17,
    approvedTransition: "kyc_independent",
    ...overrides,
  });
}

beforeEach(() => vi.stubEnv("ENTITLEMENT_SHADOW_HASH_SECRET", HASH_SECRET));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("entitlement shadow evaluation", () => {
  it("records parity using only stable outcomes and a one-way user hash", () => {
    const result = compare({ legacyAllowed: true, entitlementAllowed: true, approvedTransition: null });

    expect(result).toEqual({
      userHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      capability: "recommendation.submit",
      legacyAllowed: true,
      entitlementAllowed: true,
      classification: "parity",
      blocking: false,
      entitlementGeneration: 17,
    });
    expect(JSON.stringify(result)).not.toContain(USER_ID);
  });

  it.each<[ApprovedShadowTransition, Parameters<typeof compareShadowEvaluation>[0]["capability"]]>([
    ["profile_independent", "recommendation.submit"],
    ["profile_independent", "affiliate.limited"],
    ["kyc_independent", "recommendation.submit"],
    ["kyc_independent", "affiliate.full"],
    ["kyc_independent", "affiliate.earn_commission"],
    ["kyc_independent", "wallet.request_withdrawal"],
  ])("classifies approved %s access for %s as an expected change", (approvedTransition, capability) => {
    expect(compare({ capability, approvedTransition })).toMatchObject({
      classification: "expected_change",
      blocking: false,
    });
  });

  it("treats a new denial as blocking even when a transition is approved", () => {
    expect(compare({ legacyAllowed: true, entitlementAllowed: false })).toMatchObject({
      classification: "blocking_denial",
      blocking: true,
    });
  });

  it.each([
    [null, "affiliate.full"],
    ["profile_independent", "affiliate.full"],
    ["kyc_independent", "commerce.checkout"],
  ] as const)("treats an unapproved overgrant (%s, %s) as blocking", (approvedTransition, capability) => {
    expect(compare({ capability, approvedTransition })).toMatchObject({
      classification: "blocking_overgrant",
      blocking: true,
    });
  });

  it("uses a server-owned secret and refuses missing or weak hash configuration", () => {
    vi.stubEnv("ENTITLEMENT_SHADOW_HASH_SECRET", "");
    expect(() => compareShadowEvaluation({
      userId: USER_ID,
      capability: "platform.browse",
      legacyAllowed: true,
      entitlementAllowed: true,
      entitlementGeneration: 1,
      approvedTransition: null,
    })).toThrow("shadow_hash_secret_unavailable");

    vi.stubEnv("ENTITLEMENT_SHADOW_HASH_SECRET", "too-short");
    expect(() => compareShadowEvaluation({
      userId: USER_ID,
      capability: "platform.browse",
      legacyAllowed: true,
      entitlementAllowed: true,
      entitlementGeneration: 1,
      approvedTransition: null,
    })).toThrow("shadow_hash_secret_unavailable");

    vi.stubEnv("ENTITLEMENT_SHADOW_HASH_SECRET", HASH_SECRET);
    const first = compare().userHash;
    const second = compare().userHash;
    vi.stubEnv("ENTITLEMENT_SHADOW_HASH_SECRET", "another-shadow-secret-that-is-also-32-bytes");
    const otherSecret = compareShadowEvaluation({
      userId: USER_ID,
      capability: "recommendation.submit",
      legacyAllowed: false,
      entitlementAllowed: true,
      entitlementGeneration: 17,
      approvedTransition: "kyc_independent",
    }).userHash;
    expect(first).toBe(second);
    expect(first).not.toBe(otherSecret);
  });

  it("never copies sensitive or free-form runtime fields into telemetry", () => {
    const result = compareShadowEvaluation({
      userId: USER_ID,
      capability: "wallet.request_withdrawal",
      legacyAllowed: false,
      entitlementAllowed: true,
      entitlementGeneration: 23,
      approvedTransition: "kyc_independent",
      email: "person@example.com",
      phone: "+60123456789",
      profile: { displayName: "Sensitive Name" },
      kycEvidence: "private/kyc/document.png",
      assignmentReason: "private reason",
      amount: 999.99,
    } as Parameters<typeof compareShadowEvaluation>[0] & Record<string, unknown>);

    expect(Object.keys(result).sort()).toEqual([
      "blocking",
      "capability",
      "classification",
      "entitlementAllowed",
      "entitlementGeneration",
      "legacyAllowed",
      "userHash",
    ]);
    expect(JSON.stringify(result)).not.toMatch(/person@example|60123456789|Sensitive Name|private\/kyc|private reason|999\.99/);
  });
});

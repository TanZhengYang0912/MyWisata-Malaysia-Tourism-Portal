import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  resolveServerCustomerCapabilities: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  })),
}));

vi.mock("@/lib/auth/customer-capabilities.server", () => ({
  resolveServerCustomerCapabilities: mocks.resolveServerCustomerCapabilities,
}));

import { GET } from "../route";

function queryResult(data: unknown) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
      }),
    }),
  };
}

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "traveller@example.com",
          email_confirmed_at: "2026-08-01T00:00:00.000Z",
          identities: [],
        },
      },
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === "users") {
        return queryResult({
          id: "user-1",
          email: "traveller@example.com",
          full_name: "Traveller",
          avatar_url: null,
          kyc_status: "unverified",
          tier: "phone_verified",
          email_verified_at: "2026-08-01T00:00:00.000Z",
          phone_verified_at: "2026-08-02T00:00:00.000Z",
          profile_completed_at: null,
          status: "active",
        });
      }
      if (table === "user_roles") {
        return queryResult([{
          vendor_id: null,
          outlet_id: null,
          roles: { name: "customer" },
          outlets: null,
        }]);
      }
      if (table === "outlet_managers") return queryResult([]);
      throw new Error(`unexpected table ${table}`);
    });
    mocks.resolveServerCustomerCapabilities.mockResolvedValue({
      "recommendation.submit": {
        capability: "recommendation.submit",
        allowed: true,
        blockerCode: null,
        qualificationPaths: [],
        entitlementGeneration: 17,
        source: "policy",
        currentTier: null,
        requiredTier: null,
        nextAction: "none",
      },
      "commerce.checkout": {
        capability: "commerce.checkout",
        allowed: false,
        blockerCode: "PHONE_VERIFICATION_REQUIRED",
        qualificationPaths: [{ type: "phone", href: "/customer/profile" }],
        entitlementGeneration: 17,
        source: "hard_guard",
        currentTier: null,
        requiredTier: null,
        nextAction: "verify_phone",
      },
    });
  });

  it("derives facts on the server and returns a resolver-authored capability snapshot", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.verificationFacts).toEqual({
      emailVerified: true,
      phoneVerified: true,
      profileComplete: false,
      kycStatus: "unverified",
      accountStatus: "active",
      roles: ["customer"],
    });
    expect(body.user.capabilities["recommendation.submit"].allowed).toBe(true);
    expect(body.user.capabilities["commerce.checkout"].blockerCode).toBe("PHONE_VERIFICATION_REQUIRED");
    expect(body.user.entitlementGeneration).toBe(17);
    expect(mocks.resolveServerCustomerCapabilities).toHaveBeenCalledWith("user-1");
  });

  it("uses the public user email fact instead of provider confirmation metadata", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "users") return queryResult({
        id: "user-1", email: "traveller@example.com", full_name: "Traveller", avatar_url: null,
        kyc_status: "unverified", tier: "email_verified", email_verified_at: null,
        phone_verified_at: null, profile_completed_at: null, status: "active",
      });
      if (table === "user_roles") return queryResult([]);
      if (table === "outlet_managers") return queryResult([]);
      throw new Error(`unexpected table ${table}`);
    });

    const body = await (await GET()).json();

    expect(body.user.verificationFacts.emailVerified).toBe(false);
  });

  it("fails closed for an unknown account status", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "users") return queryResult({
        id: "user-1", email: "traveller@example.com", full_name: "Traveller", avatar_url: null,
        kyc_status: "approved", tier: "kyc_verified", email_verified_at: "2026-08-01T00:00:00.000Z",
        phone_verified_at: null, profile_completed_at: null, status: "unexpected",
      });
      if (table === "user_roles") return queryResult([{ vendor_id: null, outlet_id: null, roles: { name: "customer" }, outlets: null }]);
      if (table === "outlet_managers") return queryResult([]);
      throw new Error(`unexpected table ${table}`);
    });

    const body = await (await GET()).json();

    expect(body.user.verificationFacts.accountStatus).toBe("suspended");
  });

  it("keeps Email plus approved KYC independent from phone and profile facts", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "users") return queryResult({
        id: "user-1", email: "traveller@example.com", full_name: "Traveller", avatar_url: null,
        kyc_status: "approved", tier: "kyc_verified", email_verified_at: "2026-08-01T00:00:00.000Z",
        phone_verified_at: null, profile_completed_at: null, status: "active",
      });
      if (table === "user_roles") return queryResult([{ vendor_id: null, outlet_id: null, roles: { name: "customer" }, outlets: null }]);
      if (table === "outlet_managers") return queryResult([]);
      throw new Error(`unexpected table ${table}`);
    });
    mocks.resolveServerCustomerCapabilities.mockResolvedValue({
      "recommendation.submit": { allowed: true, entitlementGeneration: 19 },
      "commerce.checkout": { allowed: false, blockerCode: "PHONE_VERIFICATION_REQUIRED", entitlementGeneration: 19 },
    });

    const body = await (await GET()).json();

    expect(body.user.verificationFacts).toMatchObject({
      emailVerified: true, phoneVerified: false, profileComplete: false, kycStatus: "approved", accountStatus: "active",
    });
    expect(body.user.capabilities["recommendation.submit"].allowed).toBe(true);
    expect(body.user.capabilities["commerce.checkout"].blockerCode).toBe("PHONE_VERIFICATION_REQUIRED");
  });
});

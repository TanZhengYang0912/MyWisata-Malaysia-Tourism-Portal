import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  resolveServerCustomerCapabilities: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
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
    mocks.rpc.mockResolvedValue({ data: { roleNames: [], permissionKeys: [], modules: [] }, error: null });
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
      if (table === "preference_survey_responses") return queryResult({ interests: [] });
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
        qualificationPaths: [{ type: "phone", href: "/customer/phone" }],
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

  it("returns self-only Staff role names and effective permissions", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "users") return queryResult({
        id: "user-1", email: "staff@example.com", full_name: "Staff Member", avatar_url: null,
        kyc_status: "unverified", tier: "email_verified", email_verified_at: "2026-08-01T00:00:00.000Z",
        phone_verified_at: null, profile_completed_at: null, status: "active",
      });
      if (table === "user_roles") return queryResult([{ vendor_id: null, outlet_id: null, roles: { name: "staff" }, outlets: null }]);
      if (table === "outlet_managers") return queryResult([]);
      if (table === "preference_survey_responses") return queryResult({ interests: [] });
      throw new Error(`unexpected table ${table}`);
    });
    mocks.rpc.mockResolvedValue({
      data: {
        roleNames: ["KYC Reviewer"],
        permissionKeys: ["admin.kyc.review"],
        modules: [{
          id: "module-1", key: "kyc_review", label: "KYC Review", labelKey: "navigation.KYC Review",
          description: "Review KYC", sectionKey: "governance", sectionLabel: "Governance",
          sectionLabelKey: "navigationSections.governance", sectionSortOrder: 20, href: "/admin/kyc",
          iconKey: "shield", sortOrder: 40, groupKey: null, groupName: null,
          permissionKeys: ["admin.kyc.review"],
        }],
      },
      error: null,
    });

    const body = await (await GET()).json();

    expect(mocks.rpc).toHaveBeenCalledWith("get_my_staff_access");
    expect(body.user.staffRoleNames).toEqual(["KYC Reviewer"]);
    expect(body.user.staffPermissionKeys).toEqual(["admin.kyc.review"]);
    expect(body.user.staffModules).toEqual([expect.objectContaining({ key: "kyc_review", href: "/admin/kyc" })]);
  });

  it("loads database navigation Modules for a legacy Admin identity", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "users") return queryResult({
        id: "user-1", email: "admin@example.com", full_name: "Admin", avatar_url: null,
        kyc_status: "unverified", tier: "email_verified", email_verified_at: "2026-08-01T00:00:00.000Z",
        phone_verified_at: null, profile_completed_at: null, status: "active",
      });
      if (table === "user_roles") return queryResult([{ vendor_id: null, outlet_id: null, roles: { name: "admin" }, outlets: null }]);
      if (table === "outlet_managers") return queryResult([]);
      if (table === "preference_survey_responses") return queryResult({ interests: [] });
      throw new Error(`unexpected table ${table}`);
    });
    mocks.rpc.mockResolvedValue({ data: { roleNames: [], permissionKeys: ["admin.catalogue.review"], modules: [] }, error: null });

    const body = await (await GET()).json();

    expect(mocks.rpc).toHaveBeenCalledWith("get_my_staff_access");
    expect(body.user.staffPermissionKeys).toEqual(["admin.catalogue.review"]);
    expect(body.user.staffModules).toEqual([]);
  });

  it("keeps a claimed but unaccepted Staff invitation identity roleless", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "users") return queryResult({
        id: "user-1", email: "pending.staff@example.com", full_name: "Pending Staff", avatar_url: null,
        kyc_status: "unverified", tier: "email_verified", email_verified_at: "2026-08-01T00:00:00.000Z",
        phone_verified_at: null, profile_completed_at: null, status: "active",
      });
      if (table === "user_roles" || table === "outlet_managers") return queryResult([]);
      if (table === "preference_survey_responses") return queryResult({ interests: [] });
      throw new Error(`unexpected table ${table}`);
    });

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Role assignment pending" });
    expect(mocks.resolveServerCustomerCapabilities).not.toHaveBeenCalled();
  });

  it("uses the public user email fact instead of provider confirmation metadata", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "users") return queryResult({
        id: "user-1", email: "traveller@example.com", full_name: "Traveller", avatar_url: null,
        kyc_status: "unverified", tier: "email_verified", email_verified_at: null,
        phone_verified_at: null, profile_completed_at: null, status: "active",
      });
      if (table === "user_roles") return queryResult([{ vendor_id: null, outlet_id: null, roles: { name: "customer" }, outlets: null }]);
      if (table === "outlet_managers") return queryResult([]);
      if (table === "preference_survey_responses") return queryResult({ interests: [] });
      throw new Error(`unexpected table ${table}`);
    });

    const body = await (await GET()).json();

    expect(body.user.verificationFacts.emailVerified).toBe(false);
  });

  it("does not infer phone or KYC verification from a legacy tier", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "users") return queryResult({
        id: "user-1", email: "traveller@example.com", full_name: "Traveller",
        avatar_url: null, tier: "kyc_verified", kyc_status: "unverified",
        email_verified_at: "2026-08-01T00:00:00.000Z",
        phone_verified_at: null, profile_completed_at: null, status: "active",
      });
      if (table === "user_roles") return queryResult([{ vendor_id: null, outlet_id: null, roles: { name: "customer" }, outlets: null }]);
      if (table === "outlet_managers") return queryResult([]);
      if (table === "preference_survey_responses") return queryResult({ interests: [] });
      throw new Error(`unexpected table ${table}`);
    });

    const body = await (await GET()).json();

    expect(body.user.verificationFacts).toMatchObject({
      phoneVerified: false, kycStatus: "unverified", profileComplete: false,
    });
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
      if (table === "preference_survey_responses") return queryResult({ interests: [] });
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
      if (table === "preference_survey_responses") return queryResult({ interests: [] });
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

  it("fails closed when a stored Profile completion timestamp has incomplete four-section evidence", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "users") return queryResult({
        id: "user-1", email: "traveller@example.com", full_name: "Traveller", avatar_url: null,
        bio: null, city: null, country: "Malaysia", kyc_status: "unverified", tier: "profile_complete",
        email_verified_at: "2026-08-01T00:00:00.000Z", phone_verified_at: null,
        profile_completed_at: "2026-08-02T00:00:00.000Z", status: "active",
      });
      if (table === "user_roles") return queryResult([{ vendor_id: null, outlet_id: null, roles: { name: "customer" }, outlets: null }]);
      if (table === "outlet_managers") return queryResult([]);
      if (table === "preference_survey_responses") return queryResult({ interests: [] });
      throw new Error(`unexpected table ${table}`);
    });

    const body = await (await GET()).json();

    expect(body.user.verificationFacts.profileComplete).toBe(false);
    expect(body.user.profileComplete).toBe(false);
  });
});

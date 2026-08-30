import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  resolveCapability: vi.fn(),
  getStats: vi.fn(),
  getExport: vi.fn(),
  generateInsight: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock("@/lib/auth/customer-capabilities.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/customer-capabilities.server")>()),
  resolveServerCustomerCapability: mocks.resolveCapability,
}));
vi.mock("@/lib/affiliate/stats", () => ({ getAffiliateStats: mocks.getStats }));
vi.mock("@/lib/affiliate/earnings-export", () => ({ getAffiliateEarningsExport: mocks.getExport }));
vi.mock("@/lib/affiliate/insight", () => ({
  generateUserInsight: mocks.generateInsight,
  ruleBasedUserInsight: vi.fn(() => "fallback"),
}));

import { GET as getStats } from "@/app/api/affiliate/stats/route";
import { GET as exportEarnings } from "@/app/api/affiliate/earnings-export/route";
import { GET as getInsight } from "@/app/api/affiliate/insight/route";

const userId = "11111111-1111-4111-8111-111111111111";

function decision(capability: string, allowed: boolean) {
  return {
    capability,
    allowed,
    blockerCode: allowed ? null : capability === "affiliate.limited" ? "PROFILE_REQUIRED" : "KYC_REQUIRED",
    qualificationPaths: allowed ? [] : capability === "affiliate.limited"
      ? [{ type: "profile", href: "/customer/profile" }]
      : [{ type: "kyc", href: "/customer/kyc" }],
    entitlementGeneration: 9,
    source: allowed ? "policy" : "hard_guard",
    currentTier: null,
    requiredTier: null,
    nextAction: allowed ? "none" : capability === "affiliate.limited" ? "complete_profile" : "submit_kyc",
  };
}

describe("customer affiliate read capability guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } } });
    mocks.resolveCapability.mockImplementation(async (_subject: string, capability: string) => decision(capability, false));
  });

  it("denies stats before reading affiliate data when neither Affiliate mode is allowed", async () => {
    const response = await getStats(new Request("http://localhost/api/affiliate/stats"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PROFILE_REQUIRED", details: { capability: "affiliate.limited" } },
    });
    expect(mocks.resolveCapability).toHaveBeenCalledWith(userId, "affiliate.full");
    expect(mocks.resolveCapability).toHaveBeenCalledWith(userId, "affiliate.limited");
    expect(mocks.getStats).not.toHaveBeenCalled();
  });

  it("denies earnings export unless commission earning is allowed", async () => {
    const response = await exportEarnings(new Request("http://localhost/api/affiliate/earnings-export?range=all"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "KYC_REQUIRED", details: { capability: "affiliate.earn_commission" } },
    });
    expect(mocks.resolveCapability).toHaveBeenCalledWith(userId, "affiliate.earn_commission");
    expect(mocks.getExport).not.toHaveBeenCalled();
  });

  it("denies performance insight unless commission earning is allowed", async () => {
    const response = await getInsight();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "KYC_REQUIRED", details: { capability: "affiliate.earn_commission" } },
    });
    expect(mocks.resolveCapability).toHaveBeenCalledWith(userId, "affiliate.earn_commission");
    expect(mocks.getStats).not.toHaveBeenCalled();
    expect(mocks.generateInsight).not.toHaveBeenCalled();
  });
});

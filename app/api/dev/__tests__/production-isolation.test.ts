import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  resolveServerCustomerCapability: vi.fn(),
  clearMaturedCommissions: vi.fn(),
  isSuperAdminOrApprover: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock("@/lib/auth/customer-capabilities.server", () => ({
  customerCapabilityFailure: vi.fn(),
  resolveServerCustomerCapability: mocks.resolveServerCustomerCapability,
}));
vi.mock("@/lib/auth/customer-capabilities", () => ({
  CUSTOMER_CAPABILITY: { CHECKOUT: "checkout" },
  resolveCustomerCapability: vi.fn(),
}));
vi.mock("@/lib/affiliate/attribution", () => ({ onOrderPaid: vi.fn() }));
vi.mock("@/lib/vendor-notifications/emit", () => ({ emitVendorNotification: vi.fn() }));
vi.mock("@/lib/vendor-notifications/event-policy", () => ({
  VENDOR_EVENT_MATRIX: { newOrder: { audience: "vendor", category: "orders", email: false } },
}));
vi.mock("@/lib/affiliate/clearing", () => ({ clearMaturedCommissions: mocks.clearMaturedCommissions }));
vi.mock("@/lib/affiliate/admin-guard", () => ({ isSuperAdminOrApprover: mocks.isSuperAdminOrApprover }));

import { POST as simulatePurchase } from "@/app/api/dev/simulate-purchase/route";
import { POST as forceClear } from "@/app/api/dev/force-clear/route";

describe("development API production isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("MYWISATA_DEMO_TOOLS", "true");
    mocks.createClient.mockRejectedValue(new Error("production guard initialized Supabase"));
  });

  it("returns 404 for Demo Purchase before initializing Supabase", async () => {
    const response = await simulatePurchase(new Request("https://example.com/api/dev/simulate-purchase", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "11111111-1111-4111-8111-111111111111" }),
    }));

    expect(response.status).toBe(404);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it("returns 404 for force-clear before initializing Supabase", async () => {
    const response = await forceClear();

    expect(response.status).toBe(404);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
    expect(mocks.clearMaturedCommissions).not.toHaveBeenCalled();
  });
});

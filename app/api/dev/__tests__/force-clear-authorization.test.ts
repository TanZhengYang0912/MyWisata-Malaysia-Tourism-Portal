import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  clearMaturedCommissions: vi.fn(),
  isSuperAdminOrApprover: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock("@/lib/affiliate/clearing", () => ({ clearMaturedCommissions: mocks.clearMaturedCommissions }));
vi.mock("@/lib/affiliate/admin-guard", () => ({ isSuperAdminOrApprover: mocks.isSuperAdminOrApprover }));

import { POST } from "@/app/api/dev/force-clear/route";

describe("development force-clear authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("MYWISATA_DEMO_TOOLS", "true");
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    });
    mocks.createServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { value: "true" } }),
          }),
        }),
      }),
    });
    mocks.clearMaturedCommissions.mockResolvedValue({ confirmed: 1 });
    mocks.isSuperAdminOrApprover.mockResolvedValue(false);
  });

  it("rejects a signed-in non-admin before service-role work", async () => {
    const response = await POST();

    expect(response.status).toBe(403);
    expect(mocks.isSuperAdminOrApprover).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
    expect(mocks.clearMaturedCommissions).not.toHaveBeenCalled();
  });
});

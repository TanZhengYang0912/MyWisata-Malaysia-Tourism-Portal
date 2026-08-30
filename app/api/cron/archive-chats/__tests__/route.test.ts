import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  getChatArchiveDays: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock("@/lib/chat/settings", () => ({ getChatArchiveDays: mocks.getChatArchiveDays }));

import { GET } from "@/app/api/cron/archive-chats/route";

describe("Chat archive cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    mocks.createServiceClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.getChatArchiveDays.mockResolvedValue(90);
    mocks.rpc.mockResolvedValue({ data: 4, error: null });
  });

  it("rejects an unauthenticated scheduled GET before service-role work", async () => {
    const response = await GET(new Request("https://example.com/api/cron/archive-chats"));

    expect(response.status).toBe(401);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it("archives through the service-role RPC for an authenticated scheduled GET", async () => {
    const response = await GET(new Request("https://example.com/api/cron/archive-chats", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("archive_inactive_chats", { days: 90 });
    await expect(response.json()).resolves.toEqual({ archived: 4, thresholdDays: 90 });
  });
});

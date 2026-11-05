import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } })),
}));

import { POST } from "../route";

describe("POST /api/account/restore error recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("keeps actionable known account-state messages", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "account_not_deleted" } });
    const response = await POST();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "This account is already active." });
  });

  it("does not return internal RPC diagnostics", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "function restore_my_account does not exist in schema cache" } });
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("schema cache");
    expect(JSON.stringify(body)).not.toContain("restore_my_account");
  });
});

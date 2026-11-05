import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), createServiceClient: vi.fn(), isSuperAdmin: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock("@/lib/affiliate/admin-guard", () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock("@/lib/chatbot/embed", () => ({ embedText: vi.fn() }));

import { POST } from "../route";

describe("POST /api/admin/chatbot/reindex public error boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LLM_API_KEY", "test-key");
    mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } } }) } });
    mocks.isSuperAdmin.mockResolvedValue(true);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("does not disclose provider configuration names", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain("LLM_API_KEY");
  });

  it("does not return database driver diagnostics", async () => {
    const query = { select: vi.fn(), eq: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockResolvedValue({ data: null, error: { message: "ECONNREFUSED 127.0.0.1:5432" } });
    mocks.createServiceClient.mockReturnValue({ from: vi.fn(() => query) });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(body)).not.toContain("127.0.0.1");
  });
});

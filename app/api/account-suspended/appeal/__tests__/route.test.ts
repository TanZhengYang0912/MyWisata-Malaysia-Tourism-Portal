import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  moderateAccountText: vi.fn(),
  classifyTicketSmart: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      insert: mocks.insert,
    }),
  }),
}));
vi.mock("@/lib/moderation", () => ({ moderateAccountText: mocks.moderateAccountText }));
vi.mock("@/lib/chatbot/classify-ai", () => ({ classifyTicketSmart: mocks.classifyTicketSmart }));

const { POST } = await import("../route");

const user = { id: "11111111-1111-4111-8111-111111111111" };

function request(body: unknown) {
  return new Request("http://localhost/api/account-suspended/appeal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/account-suspended/appeal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user } });
    mocks.moderateAccountText.mockResolvedValue({ flagged: false });
    mocks.classifyTicketSmart.mockResolvedValue({ category: "general", method: "keyword" });
    mocks.single.mockResolvedValue({ data: { id: "ticket-1" }, error: null });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.insert.mockReturnValue({ select: mocks.select });
  });

  it("rejects an appeal shorter than 10 characters", async () => {
    const response = await POST(request({ body: "too short" }));

    expect(response.status).toBe(422);
    expect(mocks.moderateAccountText).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects flagged appeals without creating a ticket", async () => {
    mocks.moderateAccountText.mockResolvedValue({ flagged: true, categories: ["harassment"] });

    const response = await POST(request({ body: "A sufficiently long appeal" }));

    expect(response.status).toBe(422);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("fails closed when moderation is unavailable", async () => {
    mocks.moderateAccountText.mockResolvedValue({ error: "api_unavailable" });

    const response = await POST(request({ body: "A sufficiently long appeal" }));

    expect(response.status).toBe(503);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("creates the fixed suspension-appeal ticket after clean moderation", async () => {
    const body = "A sufficiently long appeal";
    const response = await POST(request({ body }));

    expect(response.status).toBe(201);
    expect(mocks.moderateAccountText).toHaveBeenCalledWith(body, "suspension_appeal");
    expect(mocks.classifyTicketSmart).toHaveBeenCalledWith("Account suspension appeal", body);
    expect(mocks.insert).toHaveBeenCalledWith({
      user_id: user.id,
      session_id: null,
      subject: "Account suspension appeal",
      body,
      category: "general",
      classification_method: "keyword",
      status: "open",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), insert: vi.fn(), rpc: vi.fn(), clean: vi.fn(), external: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: () => ({ insert: mocks.insert }) }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/moderation/clean", () => ({ cleanUserContent: mocks.clean }));
vi.mock("@/lib/moderation", () => ({ moderateAccountText: mocks.external }));
vi.mock("@/lib/chatbot/classify-ai", () => ({ classifyTicketSmart: mocks.external }));
import { POST } from "../route";
import { redactPII } from "@/lib/chatbot/pii";
const operationId = "00000000-0000-4000-8000-000000000001";
const ticketId = "00000000-0000-4000-8000-000000000002";
const request = (body: string, id = operationId) => new Request("http://localhost/api/account-suspended/appeal", { method: "POST", body: JSON.stringify({ body, operationId: id }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "customer-1" } } });
  mocks.clean.mockImplementation(async (body: string) => ({ display: redactPII(body).clean }));
  mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "ticket-1" }, error: null }) }) });
  mocks.rpc.mockResolvedValue({ data: { id: ticketId, category: "kyc", created: true }, error: null });
});
describe("private suspension appeals", () => {
  it("rejects unauthenticated and short inputs before processing", async () => {
    expect((await POST(request("short"))).status).toBe(422);
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request("Please review my account"))).status).toBe(401);
    expect(mocks.clean).not.toHaveBeenCalled();
  });
  it("cleans and locally classifies a private ticket through the atomic server operation", async () => {
    const response = await POST(request("Please review my identity 900101-14-5678 and email me@example.test"));
    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("create_account_suspension_appeal", expect.objectContaining({
      p_user_id: "customer-1",
      p_operation_id: operationId,
      p_body: "Please review my identity [IC] and email [EMAIL]",
      p_category: "kyc",
      p_payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.external).not.toHaveBeenCalled();
  });

  it("returns the existing appeal on a repeated operation without creating another ticket", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: ticketId, category: "kyc", created: false }, error: null });

    const response = await POST(request("Please review my account"));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("maps non-suspended and changed-payload results to stable public errors", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "account_not_suspended" } });
    const notSuspended = await POST(request("Please review my account"));
    expect(notSuspended.status).toBe(409);
    expect(await notSuspended.text()).not.toContain("account_not_suspended");

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "support_ticket_operation_conflict" } });
    const conflict = await POST(request("Please review another account"));
    expect(conflict.status).toBe(409);
    expect(await conflict.text()).not.toContain("support_ticket_operation_conflict");
  });
  it("fails safely before storage if local cleaning is unavailable", async () => {
    mocks.clean.mockRejectedValue(new Error("private original evidence"));
    const response = await POST(request("Please review my account"));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private original");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("validates the cleaned message before calling the atomic write", async () => {
    mocks.clean.mockResolvedValue({ display: "[PHONE]" });
    const response = await POST(request("1234567890"));
    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("bounds JSON before local processing", async () => {
    expect((await POST(request("a".repeat(17000)))).status).toBe(413);
    expect(mocks.clean).not.toHaveBeenCalled();
  });
});

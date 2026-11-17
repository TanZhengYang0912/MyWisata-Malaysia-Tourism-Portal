import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), insert: vi.fn(), rpc: vi.fn(), clean: vi.fn(), external: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: () => ({ insert: mocks.insert }) }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/moderation/clean", () => ({ cleanUserContent: mocks.clean }));
vi.mock("@/lib/moderation", () => ({ moderateAccountText: mocks.external }));
vi.mock("@/lib/chatbot/classify-ai", () => ({ classifyTicketSmart: mocks.external }));
import { POST } from "../route";
import { redactPII } from "@/lib/chatbot/pii";
const request = (body: string) => new Request("http://localhost/api/account-suspended/appeal", { method: "POST", body: JSON.stringify({ body }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "customer-1" } } });
  mocks.clean.mockImplementation(async (body: string) => ({ display: redactPII(body).clean }));
  mocks.rpc.mockResolvedValue({ data: { id: "ticket-1", category: "kyc", created: true }, error: null });
});
describe("private suspension appeals", () => {
  it("rejects unauthenticated and short inputs before processing", async () => {
    expect((await POST(request("short"))).status).toBe(422);
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request("Please review my account"))).status).toBe(401);
    expect(mocks.clean).not.toHaveBeenCalled();
  });
  it("cleans and locally classifies a private ticket without external AI", async () => {
    const response = await POST(request("Please review my identity 900101-14-5678 and email me@example.test"));
    expect(response.status).toBe(201);
    // Signed-in users can no longer insert tickets; the service-only appeal function writes it.
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("create_account_suspension_appeal", expect.objectContaining({
      p_user_id: "customer-1", p_body: "Please review my identity [IC] and email [EMAIL]", p_category: "kyc",
    }));
    expect(mocks.external).not.toHaveBeenCalled();
  });
  it("fails safely before storage if local cleaning is unavailable", async () => {
    mocks.clean.mockRejectedValue(new Error("private original evidence"));
    const response = await POST(request("Please review my account"));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private original");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("tells a user whose account is not suspended to refresh instead of filing", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "account_not_suspended" } });
    expect((await POST(request("Please review my account"))).status).toBe(409);
  });
  it("bounds JSON before local processing", async () => {
    expect((await POST(request("a".repeat(17000)))).status).toBe(413);
    expect(mocks.clean).not.toHaveBeenCalled();
  });
});

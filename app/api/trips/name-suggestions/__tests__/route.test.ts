import { beforeEach, describe, expect, it, vi } from "vitest";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  resolveCapability: vi.fn(),
  capabilityFailure: vi.fn(),
  callGemini: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth/customer-capabilities.server", () => ({
  resolveServerCustomerCapability: mocks.resolveCapability,
  customerCapabilityFailure: mocks.capabilityFailure,
}));
vi.mock("@/lib/admin-ai/gemini", () => ({ callGemini: mocks.callGemini }));

const { POST } = await import("../route");
const { __resetTripNameSuggestionRouteStateForTests } = await import("../route-state");

function request(body: unknown = {
  idea: "Penang",
  startDate: "2026-09-17",
  endDate: "2026-09-19",
  locale: "en",
}) {
  return new Request("http://localhost/api/trips/name-suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/trips/name-suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetTripNameSuggestionRouteStateForTests();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "alice@example.com" } }, error: null });
    mocks.resolveCapability.mockResolvedValue({ allowed: true, blockerCode: null });
    mocks.capabilityFailure.mockReturnValue(null);
    mocks.callGemini.mockResolvedValue(JSON.stringify({ suggestions: [
      "Penang 3D2N Escape",
      "Discover Penang",
      "Penang Getaway",
    ] }));
  });

  it("requires authentication without calling the AI provider", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "expired" } });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.resolveCapability).not.toHaveBeenCalled();
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it("enforces the existing basic-AI customer capability", async () => {
    const blocked = Response.json({ data: null, error: { code: "PHONE_VERIFICATION_REQUIRED" } }, { status: 403 });
    mocks.capabilityFailure.mockReturnValueOnce(blocked);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.resolveCapability).toHaveBeenCalledWith("user-1", CUSTOMER_CAPABILITY.BASIC_AI);
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it("sends only grounded naming inputs to Gemini and returns private output", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.callGemini).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({
        idea: "Penang",
        startDate: "2026-09-17",
        endDate: "2026-09-19",
        duration: { days: 3, nights: 2 },
        locale: "en",
      }),
      { temperature: 0.55, maxOutputTokens: 180 },
    );
    expect(body.data).toEqual({
      suggestions: ["Penang 3D2N Escape", "Discover Penang", "Penang Getaway"],
      aiAvailable: true,
      duration: { days: 3, nights: 2 },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("user-1");
    expect(serialized).not.toContain("alice@example.com");
    expect(serialized).not.toContain("LLM_API_KEY");
  });

  it("strictly validates input before provider work", async () => {
    expect((await POST(request({ idea: "P", startDate: "2026-09-17", endDate: "2026-09-19", locale: "en" }))).status).toBe(422);
    expect((await POST(request({ idea: "Penang", startDate: "2026-09-19", endDate: "2026-09-17", locale: "en" }))).status).toBe(422);
    expect((await POST(request({ idea: "Penang", startDate: "2026-09-17", endDate: "2026-09-19", locale: "en", userId: "other" }))).status).toBe(422);
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared request before parsing or provider work", async () => {
    const oversized = request();
    oversized.headers.set("content-length", "5000");

    const response = await POST(oversized);

    expect(response.status).toBe(413);
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it("rejects an oversized streamed request without a content-length header", async () => {
    const response = await POST(request({
      idea: "x".repeat(5_000),
      startDate: "2026-09-17",
      endDate: "2026-09-19",
      locale: "en",
    }));

    expect(response.status).toBe(413);
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it("returns grounded deterministic suggestions when Gemini fails or is malformed", async () => {
    mocks.callGemini.mockRejectedValueOnce(new Error("secret provider failure /Users/private/key"));
    const failedResponse = await POST(request());
    const failedBody = await failedResponse.json();
    expect(failedResponse.status).toBe(200);
    expect(failedBody.data).toEqual({
      suggestions: ["Penang 3D2N", "Penang Escape", "Penang Getaway"],
      aiAvailable: false,
      duration: { days: 3, nights: 2 },
    });
    expect(JSON.stringify(failedBody)).not.toContain("/Users/private");

    mocks.callGemini.mockResolvedValueOnce('{"suggestions":["Penang 7D6N"]}');
    const malformedBody = await (await POST(request())).json();
    expect(malformedBody.data.aiAvailable).toBe(false);
    expect(malformedBody.data.suggestions[0]).toBe("Penang 3D2N");
  });

  it("returns Simplified Chinese names for a Chinese preference even when Gemini answers in English", async () => {
    mocks.callGemini.mockResolvedValueOnce(JSON.stringify({ suggestions: [
      "Melaka 3D2N Escape",
      "Discover Melaka",
      "Melaka Getaway",
    ] }));

    const response = await POST(request({
      idea: "马六甲",
      startDate: "2026-09-17",
      endDate: "2026-09-19",
      locale: "zh-CN",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      suggestions: ["马六甲 3天2夜", "漫游马六甲", "马六甲探索之旅"],
      aiAvailable: false,
      duration: { days: 3, nights: 2 },
    });
    expect(mocks.callGemini).toHaveBeenCalledWith(
      expect.stringContaining("zh-CN: Simplified Chinese"),
      expect.stringContaining('"locale":"zh-CN"'),
      { temperature: 0.55, maxOutputTokens: 180 },
    );
  });

  it("does not echo PII from provider output or deterministic fallbacks", async () => {
    mocks.callGemini.mockResolvedValueOnce(JSON.stringify({ suggestions: [
      "Penang alice@example.com",
      "Call +60123456789",
      "Passport A12345678",
    ] }));
    const response = await POST(request({
      idea: "Penang alice@example.com",
      startDate: "2026-09-17",
      endDate: "2026-09-19",
      locale: "en",
    }));
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(serialized).not.toContain("alice@example.com");
    expect(serialized).not.toContain("+60123456789");
    expect(serialized).not.toContain("A12345678");
  });

  it("rate-limits repeated requests per authenticated user", async () => {
    for (let index = 0; index < 10; index += 1) {
      expect((await POST(request())).status).toBe(200);
    }
    expect((await POST(request())).status).toBe(429);
    expect(mocks.callGemini).toHaveBeenCalledTimes(10);
  });
});

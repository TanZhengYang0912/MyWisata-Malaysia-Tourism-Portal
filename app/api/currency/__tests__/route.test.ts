import { beforeEach, describe, expect, it, vi } from "vitest";
import { REFERENCE_CURRENCY_COOKIE } from "@/lib/currency/reference";

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
}));

const { POST } = await import("../route");

function request(body: unknown) {
  return new Request("http://localhost/api/currency", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/currency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the supported display currency to a one-year cookie", async () => {
    const response = await POST(request({ currency: "USD" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { currency: "USD" } });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      REFERENCE_CURRENCY_COOKIE,
      "USD",
      expect.objectContaining({
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
        secure: process.env.NODE_ENV === "production",
      }),
    );
  });

  it.each(["GBP", "myr", "", null, 42])("rejects unsupported currency %j", async (currency) => {
    const response = await POST(request({ currency }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Unsupported currency" });
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("rejects malformed and null JSON bodies", async () => {
    const malformed = await POST(new Request("http://localhost/api/currency", {
      method: "POST",
      body: "{",
    }));
    const nullBody = await POST(request(null));

    expect(malformed.status).toBe(400);
    expect(nullBody.status).toBe(400);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});

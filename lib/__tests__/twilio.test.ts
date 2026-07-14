import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Twilio Verify", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the singular VerificationCheck endpoint for OTP verification", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VAtest");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "approved" }), { status: 200 }),
    ));

    const { verifyOtp } = await import("@/lib/twilio");
    await verifyOtp("+60177143951", "553600");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/VerificationCheck"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/VerificationChecks"),
      expect.anything(),
    );
  });
});

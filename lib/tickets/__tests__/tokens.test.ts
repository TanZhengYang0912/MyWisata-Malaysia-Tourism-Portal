import { describe, expect, it } from "vitest";
import { signTicketPassToken, verifyTicketPassToken, type TicketPassClaims } from "@/lib/tickets/tokens";

describe("Ticket Pass Signed Tokens", () => {
  const secret = "test_ticket_secret_key_1234567890";
  const sampleClaims: TicketPassClaims = {
    passId: "pass-111",
    bookingId: "bk-222",
    outletId: "out-333",
    policy: "multi_entry",
    entryLimit: 3,
    issuedAt: Date.now(),
  };

  it("signs and successfully verifies a valid ticket token", () => {
    const token = signTicketPassToken(sampleClaims, secret);
    expect(token.startsWith("v1.")).toBe(true);

    const result = verifyTicketPassToken(token, secret);
    expect(result.valid).toBe(true);
    expect(result.claims?.passId).toBe("pass-111");
    expect(result.claims?.entryLimit).toBe(3);
    expect(result.claims?.policy).toBe("multi_entry");
  });

  it("rejects token signed with different secret", () => {
    const token = signTicketPassToken(sampleClaims, "wrong_secret");
    const result = verifyTicketPassToken(token, secret);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("invalid_signature");
  });

  it("rejects tampered token payload", () => {
    const token = signTicketPassToken(sampleClaims, secret);
    const [v, payload, sig] = token.split(".");
    const tamperedPayload = payload.slice(0, -1) + (payload.slice(-1) === "a" ? "b" : "a");
    const result = verifyTicketPassToken(`${v}.${tamperedPayload}.${sig}`, secret);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("invalid_signature");
  });

  it("rejects expired token", () => {
    const expiredClaims: TicketPassClaims = {
      ...sampleClaims,
      exp: Math.floor(Date.now() / 1000) - 10,
    };
    const token = signTicketPassToken(expiredClaims, secret);
    const result = verifyTicketPassToken(token, secret);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("token_expired");
  });
});

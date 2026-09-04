import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseExternalWebhookBody, verifyWebhookSignature } from "@/lib/integrations/webhook-verifier";

describe("verifyWebhookSignature", () => {
  const secret = "test_webhook_secret_key_12345";
  const body = JSON.stringify({ externalBookingId: "bk-100", slotId: "slot-200" });

  it("validates correct raw signature and sha256= prefix", () => {
    const rawSig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, rawSig, secret)).toBe(true);
    expect(verifyWebhookSignature(body, `sha256=${rawSig}`, secret)).toBe(true);
  });

  it("rejects invalid signature or wrong secret", () => {
    const wrongSig = createHmac("sha256", "wrong_secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, wrongSig, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "invalid_hex", secret)).toBe(false);
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
  });
});

describe("parseExternalWebhookBody", () => {
  it("strictly validates required fields and defaults quantity to 1", () => {
    const parsed = parseExternalWebhookBody({
      sourceIdentifier: "airbnb_feed_01",
      externalBookingId: "AB-9988",
      slotId: "40d12e88-6617-4db3-99ba-a5a41be1df78",
      guestName: "Alice Smith",
    });

    expect(parsed.sourceIdentifier).toBe("airbnb_feed_01");
    expect(parsed.externalBookingId).toBe("AB-9988");
    expect(parsed.quantity).toBe(1);
    expect(parsed.action).toBe("book");
    expect(parsed.guestName).toBe("Alice Smith");
  });

  it("throws on missing required fields", () => {
    expect(() => parseExternalWebhookBody({})).toThrow("Missing required sourceIdentifier");
    expect(() =>
      parseExternalWebhookBody({ sourceIdentifier: "src1" }),
    ).toThrow("Missing required externalBookingId");
  });
});

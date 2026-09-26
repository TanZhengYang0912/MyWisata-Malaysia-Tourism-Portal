import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseExternalWebhookBody, parseExternalWebhookSourceIdentifier, readBoundedWebhookBody, verifyWebhookSignature } from "@/lib/integrations/webhook-verifier";

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
  it("keeps backward-compatible omitted quantity/action defaults for valid payloads", () => {
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

  it.each([0, -1, 1.5, "2", null])("rejects invalid quantity %s", (quantity) => {
    expect(() => parseExternalWebhookBody({
      sourceIdentifier: "airbnb_feed_01",
      externalBookingId: "AB-9988",
      slotId: "40d12e88-6617-4db3-99ba-a5a41be1df78",
      quantity,
    })).toThrow("Quantity must be a positive integer");
  });

  it.each(["refund", "", 2, null])("rejects unsupported action %s", (action) => {
    expect(() => parseExternalWebhookBody({
      sourceIdentifier: "airbnb_feed_01",
      externalBookingId: "AB-9988",
      slotId: "40d12e88-6617-4db3-99ba-a5a41be1df78",
      action,
    })).toThrow("Action must be book or cancel");
  });

  it("rejects non-UUID slots and oversized/invalid metadata", () => {
    const valid = { sourceIdentifier: "airbnb_feed_01", externalBookingId: "AB-9988", slotId: "not-a-uuid" };
    expect(() => parseExternalWebhookBody(valid)).toThrow("Invalid slotId");
    expect(() => parseExternalWebhookBody({ ...valid, slotId: "40d12e88-6617-4db3-99ba-a5a41be1df78", metadata: [] })).toThrow("Metadata must be an object");
    expect(() => parseExternalWebhookBody({ ...valid, slotId: "40d12e88-6617-4db3-99ba-a5a41be1df78", metadata: { blob: "x".repeat(20_000) } })).toThrow("Metadata is too large");
  });

  it("extracts only a bounded source identifier before authenticating the full event", () => {
    expect(parseExternalWebhookSourceIdentifier({ sourceIdentifier: " src-1 " })).toBe("src-1");
    expect(() => parseExternalWebhookSourceIdentifier({ sourceIdentifier: "x".repeat(161) })).toThrow("Invalid sourceIdentifier");
  });

  it("bounds streamed webhook bodies before parsing", async () => {
    const request = new Request("http://localhost/webhook", { method: "POST", body: "12345" });
    await expect(readBoundedWebhookBody(request, 4)).rejects.toThrow("Webhook body is too large");
  });
});

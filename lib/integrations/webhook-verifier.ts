import { createHmac, timingSafeEqual } from "node:crypto";

export interface ExternalBookingPayload {
  sourceIdentifier: string;
  externalBookingId: string;
  slotId: string;
  quantity: number;
  action: "book" | "cancel";
  guestName?: string;
  guestEmail?: string;
  metadata?: Record<string, unknown>;
}

export function verifyWebhookSignature(
  rawBody: string,
  providedSignature: string | null | undefined,
  secret: string,
): boolean {
  if (!providedSignature || !secret) return false;

  const normalizedProvided = providedSignature.startsWith("sha256=")
    ? providedSignature.slice(7)
    : providedSignature;

  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  if (computed.length !== normalizedProvided.length) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(computed, "utf8"),
      Buffer.from(normalizedProvided, "utf8"),
    );
  } catch {
    return false;
  }
}

export function parseExternalWebhookBody(body: unknown): ExternalBookingPayload {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid webhook body: expected an object");
  }

  const b = body as Record<string, unknown>;

  if (typeof b.sourceIdentifier !== "string" || !b.sourceIdentifier.trim()) {
    throw new Error("Missing required sourceIdentifier");
  }
  if (typeof b.externalBookingId !== "string" || !b.externalBookingId.trim()) {
    throw new Error("Missing required externalBookingId");
  }
  if (typeof b.slotId !== "string" || !b.slotId.trim()) {
    throw new Error("Missing required slotId");
  }

  const quantity = typeof b.quantity === "number" ? Math.floor(b.quantity) : 1;
  if (quantity < 1) {
    throw new Error("Quantity must be a positive integer");
  }

  const action = b.action === "cancel" ? "cancel" : "book";

  return {
    sourceIdentifier: b.sourceIdentifier.trim(),
    externalBookingId: b.externalBookingId.trim(),
    slotId: b.slotId.trim(),
    quantity,
    action,
    guestName: typeof b.guestName === "string" ? b.guestName.trim() : undefined,
    guestEmail: typeof b.guestEmail === "string" ? b.guestEmail.trim() : undefined,
    metadata: typeof b.metadata === "object" && b.metadata !== null ? (b.metadata as Record<string, unknown>) : {},
  };
}

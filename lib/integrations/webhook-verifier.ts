import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_EXTERNAL_WEBHOOK_BODY_BYTES = 64 * 1024;
const MAX_EXTERNAL_WEBHOOK_METADATA_BYTES = 16 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function readBoundedWebhookBody(
  request: Request,
  maxBytes = MAX_EXTERNAL_WEBHOOK_BODY_BYTES,
): Promise<string> {
  const rawLength = request.headers.get("content-length");
  if (rawLength && (!/^\d+$/.test(rawLength) || Number(rawLength) > maxBytes)) {
    throw new Error("Webhook body is too large");
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Webhook body is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Webhook body is not valid UTF-8");
  }
}

export function parseExternalWebhookSourceIdentifier(body: unknown): string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Invalid webhook body: expected an object");
  }
  const sourceIdentifier = (body as Record<string, unknown>).sourceIdentifier;
  if (typeof sourceIdentifier !== "string" || !sourceIdentifier.trim()) {
    throw new Error("Missing required sourceIdentifier");
  }
  if (sourceIdentifier.trim().length > 160) {
    throw new Error("Invalid sourceIdentifier");
  }
  return sourceIdentifier.trim();
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
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Invalid webhook body: expected an object");
  }

  const b = body as Record<string, unknown>;

  const sourceIdentifier = parseExternalWebhookSourceIdentifier(body);
  if (typeof b.externalBookingId !== "string" || !b.externalBookingId.trim()) {
    throw new Error("Missing required externalBookingId");
  }
  if (b.externalBookingId.trim().length > 200) {
    throw new Error("Invalid externalBookingId");
  }
  if (typeof b.slotId !== "string" || !UUID_PATTERN.test(b.slotId.trim())) {
    throw new Error("Invalid slotId");
  }

  const quantity = b.quantity === undefined ? 1 : b.quantity;
  if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000) {
    throw new Error("Quantity must be a positive integer");
  }

  const action = b.action === undefined ? "book" : b.action;
  if (action !== "book" && action !== "cancel") {
    throw new Error("Action must be book or cancel");
  }

  if (b.guestName !== undefined && (typeof b.guestName !== "string" || b.guestName.trim().length > 200)) {
    throw new Error("Invalid guestName");
  }
  if (b.guestEmail !== undefined && (typeof b.guestEmail !== "string" || b.guestEmail.trim().length > 320)) {
    throw new Error("Invalid guestEmail");
  }

  let metadata: Record<string, unknown> = {};
  if (b.metadata !== undefined) {
    if (typeof b.metadata !== "object" || b.metadata === null || Array.isArray(b.metadata)) {
      throw new Error("Metadata must be an object");
    }
    const serialized = JSON.stringify(b.metadata);
    if (Buffer.byteLength(serialized, "utf8") > MAX_EXTERNAL_WEBHOOK_METADATA_BYTES) {
      throw new Error("Metadata is too large");
    }
    metadata = b.metadata as Record<string, unknown>;
  }

  return {
    sourceIdentifier,
    externalBookingId: b.externalBookingId.trim(),
    slotId: b.slotId.trim(),
    quantity,
    action: action as "book" | "cancel",
    guestName: typeof b.guestName === "string" ? b.guestName.trim() : undefined,
    guestEmail: typeof b.guestEmail === "string" ? b.guestEmail.trim() : undefined,
    metadata,
  };
}

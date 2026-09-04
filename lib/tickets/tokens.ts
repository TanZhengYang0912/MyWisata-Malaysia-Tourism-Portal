import { createHmac, timingSafeEqual } from "crypto";

export interface TicketTokenPayload {
  passId: string;
  bookingId: string;
  policy?: "single_entry" | "group_entry" | "multi_entry";
  entryLimit?: number;
  outletId?: string;
  issuedAt?: number;
  exp?: number; // expiration epoch timestamp in seconds
}

export type TicketPassClaims = TicketTokenPayload;

function getSigningSecret(): string {
  return (
    process.env.TICKET_QR_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "mywisata-ticket-signing-secret-dev"
  );
}

function base64UrlEncode(data: string | Buffer): string {
  const base64 = (typeof data === "string" ? Buffer.from(data, "utf8") : data).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Creates a cryptographically verifiable ticket token with HMAC-SHA256.
 * Format: v1.<base64url(jsonPayload)>.<base64url(hmac)>
 */
export function signTicketToken(payload: TicketTokenPayload, secret = getSigningSecret()): string {
  const jsonPayload = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(jsonPayload);
  const signature = createHmac("sha256", secret)
    .update(`v1.${encodedPayload}`)
    .digest();
  const encodedSignature = base64UrlEncode(signature);
  return `v1.${encodedPayload}.${encodedSignature}`;
}

export const signTicketPassToken = signTicketToken;

/**
 * Validates the HMAC-SHA256 signature and expiration of a ticket token.
 */
export function verifyTicketToken(
  token: string,
  secret = getSigningSecret(),
  nowSeconds = Math.floor(Date.now() / 1000),
): { valid: boolean; payload?: TicketTokenPayload; claims?: TicketTokenPayload; error?: string } {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "missing_token" };
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return { valid: false, error: "invalid_token_format" };
  }

  const [, encodedPayload, encodedSignature] = parts;

  let expectedSignature: Buffer;
  let receivedSignature: Buffer;
  try {
    expectedSignature = createHmac("sha256", secret)
      .update(`v1.${encodedPayload}`)
      .digest();
    receivedSignature = Buffer.from(
      encodedSignature.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (encodedSignature.length % 4)) % 4),
      "base64",
    );
  } catch {
    return { valid: false, error: "signature_decode_failed" };
  }

  if (
    expectedSignature.length !== receivedSignature.length ||
    !timingSafeEqual(expectedSignature, receivedSignature)
  ) {
    return { valid: false, error: "invalid_signature" };
  }

  let payload: TicketTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as TicketTokenPayload;
  } catch {
    return { valid: false, error: "invalid_payload_json" };
  }

  if (!payload.bookingId || !payload.passId) {
    return { valid: false, error: "invalid_payload_fields" };
  }

  if (payload.exp && payload.exp < nowSeconds) {
    return { valid: false, payload, claims: payload, error: "token_expired" };
  }

  return { valid: true, payload, claims: payload };
}

export const verifyTicketPassToken = verifyTicketToken;

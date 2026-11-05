import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { databaseUuidSchema } from "@/lib/validation/schemas";

export type RetailPickupClaims = {
  kind: "retail_pickup";
  orderId: string;
  orderItemId: string;
  vendorId: string;
  outletId: string;
  issuedAt: number;
  exp?: number;
};

type RetailPickupClaimsInput = Omit<RetailPickupClaims, "kind">;
const MAX_TOKEN_LENGTH = 2048;

function getSecret() {
  const secret = process.env.RETAIL_PICKUP_QR_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) throw new Error("retail_pickup_signing_secret_unavailable");
  return secret;
}

function encode(value: string | Buffer) {
  return (typeof value === "string" ? Buffer.from(value) : value).toString("base64url");
}

function isClaims(value: unknown): value is RetailPickupClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const claims = value as Record<string, unknown>;
  const allowedKeys = new Set(["kind", "orderId", "orderItemId", "vendorId", "outletId", "issuedAt", "exp"]);
  if (Object.keys(claims).some((key) => !allowedKeys.has(key))) return false;
  return claims.kind === "retail_pickup"
    // Existing PostgreSQL/seed UUIDs do not all carry RFC version/variant bits.
    && databaseUuidSchema.safeParse(claims.orderId).success
    && databaseUuidSchema.safeParse(claims.orderItemId).success
    && databaseUuidSchema.safeParse(claims.vendorId).success
    && databaseUuidSchema.safeParse(claims.outletId).success
    && Number.isSafeInteger(claims.issuedAt) && Number(claims.issuedAt) > 0
    && (claims.exp === undefined || (Number.isSafeInteger(claims.exp) && Number(claims.exp) > 0));
}

export function signRetailPickupToken(claims: RetailPickupClaimsInput, secret = getSecret()) {
  const complete: RetailPickupClaims = { ...claims, kind: "retail_pickup" };
  if (!isClaims(complete)) throw new Error("retail_pickup_claims_invalid");
  const payload = encode(JSON.stringify(complete));
  const input = `retail1.${payload}`;
  return `${input}.${encode(createHmac("sha256", secret).update(input).digest())}`;
}

export function verifyRetailPickupToken(token: string, secret?: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return { valid: false as const };
  try {
    const signingSecret = secret ?? getSecret();
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== "retail1" || !parts[1] || !parts[2]) return { valid: false as const };
    const [version, payload, signature] = parts;
    const expected = createHmac("sha256", signingSecret).update(`${version}.${payload}`).digest();
    const received = Buffer.from(signature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(expected, received)) return { valid: false as const };
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!isClaims(parsed)) return { valid: false as const };
    if (parsed.exp !== undefined && parsed.exp < nowSeconds) return { valid: false as const, expired: true as const, claims: parsed };
    return { valid: true as const, claims: parsed };
  } catch {
    return { valid: false as const };
  }
}

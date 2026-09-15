import { createHash, createHmac, timingSafeEqual } from "crypto";

export interface VoucherStoreTokenPayload {
  kind: "voucher_claim";
  claimId: string;
  voucherId: string;
  outletId?: string | null;
  exp: number;
}

function signingSecret() {
  return process.env.VOUCHER_STORE_TOKEN_SECRET || process.env.TICKET_QR_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "mywisata-voucher-store-secret-dev";
}

function encode(value: string | Buffer) {
  return (typeof value === "string" ? Buffer.from(value, "utf8") : value).toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signVoucherStoreToken(payload: Omit<VoucherStoreTokenPayload, "kind">, secret = signingSecret()) {
  const encodedPayload = encode(JSON.stringify({ kind: "voucher_claim", ...payload }));
  const signature = encode(createHmac("sha256", secret).update(`v1.voucher.${encodedPayload}`).digest());
  return `v1.voucher.${encodedPayload}.${signature}`;
}

export function verifyVoucherStoreToken(
  token: string,
  secret = signingSecret(),
  nowSeconds = Math.floor(Date.now() / 1000),
): { valid: boolean; payload?: VoucherStoreTokenPayload; error?: string } {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || parts[1] !== "voucher") return { valid: false, error: "invalid_token_format" };

  const [, , encodedPayload, encodedSignature] = parts;
  const expected = createHmac("sha256", secret).update(`v1.voucher.${encodedPayload}`).digest();
  const received = Buffer.from(encodedSignature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return { valid: false, error: "invalid_signature" };

  let payload: VoucherStoreTokenPayload;
  try {
    payload = JSON.parse(decode(encodedPayload)) as VoucherStoreTokenPayload;
  } catch {
    return { valid: false, error: "invalid_payload_json" };
  }

  if (payload.kind !== "voucher_claim" || !payload.claimId || !payload.voucherId || !Number.isFinite(payload.exp)) return { valid: false, error: "invalid_payload_fields" };
  if (payload.exp < nowSeconds) return { valid: false, payload, error: "token_expired" };
  return { valid: true, payload };
}

export function voucherTokenFingerprint(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

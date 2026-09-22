import { createHmac, timingSafeEqual } from "node:crypto";

export interface FoodFulfilmentClaims {
  kind: "food_order";
  orderId: string;
  outletId: string;
  issuedAt: number;
  exp?: number;
}

function getSecret() {
  return process.env.FOOD_ORDER_QR_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || "mywisata-food-order-signing-secret-dev";
}

function encode(value: string | Buffer) {
  return (typeof value === "string" ? Buffer.from(value) : value).toString("base64url");
}

export function signFoodFulfilmentToken(claims: Omit<FoodFulfilmentClaims, "kind">, secret = getSecret()) {
  const payload = encode(JSON.stringify({ ...claims, kind: "food_order" }));
  const input = "food1." + payload;
  return input + "." + encode(createHmac("sha256", secret).update(input).digest());
}

export function verifyFoodFulfilmentToken(token: string, secret = getSecret(), nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "food1") return { valid: false as const };
  const [version, payload, signature] = parts;
  const expected = createHmac("sha256", secret).update(version + "." + payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) return { valid: false as const };
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as FoodFulfilmentClaims;
    if (claims.kind !== "food_order" || !claims.orderId || !claims.outletId || !Number.isFinite(claims.issuedAt)) return { valid: false as const };
    if (claims.exp !== undefined && claims.exp < nowSeconds) return { valid: false as const, claims };
    return { valid: true as const, claims };
  } catch {
    return { valid: false as const };
  }
}

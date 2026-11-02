import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolvePaymentAppUrl } from "@/lib/payments/app-url";

export const GUEST_SESSION_SECONDS = 30 * 24 * 60 * 60;
export function hashGuestCredential(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function newGuestCredential(): string { return randomBytes(32).toString("base64url"); }
function guestPublicOrigin(request: Request): string | null {
  try {
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      return new URL(request.url).origin;
    }
    if (process.env.NODE_ENV === "production") return resolvePaymentAppUrl();
    return null;
  } catch {
    return null;
  }
}
function hasSecureGuestOrigin(request: Request): boolean {
  const origin = guestPublicOrigin(request);
  return origin !== null && new URL(origin).protocol === "https:";
}
export function guestCookieName(request: Request, order = false): string | null {
  const origin = guestPublicOrigin(request);
  if (!origin) return null;
  const prefix = new URL(origin).protocol === "https:" ? "__Host-" : "";
  return `${prefix}mylawatan-${order ? "order-access" : "guest"}`;
}
function legacyGuestCookieName(request: Request, order = false): string | null {
  const origin = guestPublicOrigin(request);
  if (!origin) return null;
  const prefix = new URL(origin).protocol === "https:" ? "__Host-" : "";
  return `${prefix}mywisata-${order ? "order-access" : "guest"}`;
}
export function readGuestCookie(request: Request, order = false): string | null {
  if (!guestPublicOrigin(request)) return null;
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const name of [guestCookieName(request, order), legacyGuestCookieName(request, order)]) {
    if (!name) continue;
    const raw = cookieHeader.split(";").map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
    if (raw && /^[A-Za-z0-9_-]{43}$/.test(raw)) return raw;
  }
  return null;
}
export function setGuestCookie(response: NextResponse, request: Request, token: string, order = false) {
  const name = guestCookieName(request, order);
  if (!name) return;
  response.cookies.set(name, token, {
    httpOnly: true, secure: hasSecureGuestOrigin(request), sameSite: "lax", path: "/",
    maxAge: order ? 24 * 60 * 60 : GUEST_SESSION_SECONDS,
  });
}
export function isSameOriginMutation(request: Request): boolean {
  const expectedOrigin = guestPublicOrigin(request);
  const origin = request.headers.get("origin");
  return expectedOrigin !== null
    && origin === expectedOrigin
    && !["cross-site", "none"].includes(request.headers.get("sec-fetch-site") ?? "");
}
export function privateCheckoutJson(payload: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(payload, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export function guestPrivateResponse(data: unknown, status = 200): NextResponse {
  return privateCheckoutJson({ data, error: null }, { status });
}

export async function createGuestSession(request: Request): Promise<NextResponse> {
  const token = newGuestCredential();
  const { error } = await createServiceClient().from("guest_checkout_subjects").insert({
    token_hash: hashGuestCredential(token), expires_at: new Date(Date.now() + GUEST_SESSION_SECONDS * 1000).toISOString(),
  });
  if (error) return NextResponse.json({ data: null, error: { code: "GUEST_SESSION_UNAVAILABLE", message: "Guest checkout is temporarily unavailable." } }, { status: 503 });
  const response = guestPrivateResponse({ ready: true });
  setGuestCookie(response, request, token);
  return response;
}
export async function resolveGuestSession(request: Request): Promise<{ guestSubjectId: string } | null> {
  const token = readGuestCookie(request);
  if (!token) return null;
  const { data, error } = await createServiceClient().from("guest_checkout_subjects").select("id")
    .eq("token_hash", hashGuestCredential(token)).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  return !error && data ? { guestSubjectId: data.id as string } : null;
}
export async function reserveGuestRateLimit(key: string, maximum: number, seconds: number): Promise<boolean> {
  try {
    // Shared admission must fail quickly before a caller can fall back. This
    // client deadline also bounds rate checks made before acquiring a work slot.
    const { data, error } = await createServiceClient({ signal: AbortSignal.timeout(5_000) }).rpc("reserve_guest_rate_limit", {
      p_key_hash: hashGuestCredential(key), p_limit: maximum, p_window_seconds: seconds,
    });
    return !error && data === true;
  } catch { return false; }
}
export function guestAddressRateKey(request: Request): string {
  // Hostinger mode requires CDN enabled AND origin access restricted to that
  // trusted proxy. Enabling the CDN alone does not establish this boundary.
  let address: string | undefined;
  if (process.env.VERCEL === "1") {
    address = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  } else if (process.env.GUEST_TRUSTED_PROXY === "hostinger-cdn") {
    // Hostinger appends the visitor address; the first entry can be injected.
    address = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  }
  const canonical = address && isIP(address) ? new URL(`http://${address.includes(":") ? `[${address}]` : address}`).hostname.toLowerCase() : null;
  return `guest-address:${canonical ?? "unavailable"}`;
}
export async function readGuestJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 32768 || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return null; }
  finally { reader.releaseLock(); }
}

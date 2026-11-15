import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Locally verified (ES256 JWKS) caller id for read-only, own-data routes; null
 * means treat the caller as signed out. Unlike getUser() it does not ask the
 * Auth server, so a revoked session keeps reading its own rows until the access
 * token expires (≤ 1 h) — RLS already trusts the same token. Keep mutations,
 * payments, KYC, admin and vendor authorization on getUser(). See D4–D6 of
 * docs/plans/2026-11-15-1232-api-auth-locale-and-card-images.md.
 */
export async function getClaimsUserId(db: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await db.auth.getClaims();
    const sub = data?.claims?.sub;
    return !error && typeof sub === "string" && sub ? sub : null;
  } catch {
    // A malformed token (e.g. an unsupported alg) throws instead of returning an error.
    return null;
  }
}

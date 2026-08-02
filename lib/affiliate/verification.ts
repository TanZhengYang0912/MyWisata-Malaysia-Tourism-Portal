// P4 — Affiliate verification gate. Pure, no framework/DB imports.

import type { User } from "@/backend/core/types";
import { meetsMinTier, REQUIRED_TIER } from "@/lib/constants";

/**
 * Both call sites of this function (the /customer/affiliate dashboard gate,
 * and share-button.tsx's client-side pre-check before calling
 * POST /api/affiliate/link) exist to answer one question: "can this user
 * earn via an affiliate link?" — and the real, authoritative answer to that
 * question lives server-side in POST /api/affiliate/link's own gate:
 * meetsMinTier(profile.tier, REQUIRED_TIER.AFFILIATE_BASIC), i.e.
 * profile_complete or higher. This mirrors that exact check so neither call
 * site can silently disagree with the server that actually enforces it.
 *
 * This was previously named isKycApproved() and checked
 * verificationTier === 'kyc_verified' (REQUIRED_TIER.AFFILIATE_FULL) — a
 * name and threshold that never matched what the server-side route actually
 * required. That meant a profile_complete user (able to generate a real
 * affiliate link and already earning real commission) was blocked from
 * their own dashboard and had the share button silently skip embedding
 * their affiliate code, both because of a client-side check stricter than
 * the API that actually gates the money. Renamed + loosened to close that
 * gap. NOT the same threshold as withdrawal — REQUIRED_TIER.WITHDRAWAL is
 * kyc_verified and is checked independently, elsewhere; nothing here
 * changes that.
 *
 * ⚠️ Team decision 2026-08-01: vendor_owner/outlet_manager accounts cannot
 * earn affiliate commission at all (see lib/affiliate/vendor-role-guard.ts
 * for the full reasoning and the real, server-side enforcement). This
 * function's `role` check is BEST-EFFORT UX ONLY — `user.role` is populated
 * client-side from the user_roles/roles join table
 * (components/providers/auth.tsx::loadSupabaseUser()), which is a
 * best-effort mirror of vendor_owner status, not authoritative (the real
 * source of truth is a `vendors` row, checked fresh server-side). A stale
 * or missing `role` here can at worst show the "Earn & Share" UI to
 * someone who then gets correctly rejected server-side — it can never let
 * a vendor actually generate a link or earn, since POST /api/affiliate/link
 * and onOrderPaid() both re-check fresh against the real tables regardless
 * of what this function decided.
 */
export function isAffiliateEligible(user: Pick<User, "verificationTier" | "role"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "vendor_owner" || user.role === "outlet_manager") return false;
  return meetsMinTier(user.verificationTier, REQUIRED_TIER.AFFILIATE_BASIC);
}

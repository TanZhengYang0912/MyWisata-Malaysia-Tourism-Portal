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
 */
export function isAffiliateEligible(user: Pick<User, "verificationTier"> | null | undefined): boolean {
  if (!user) return false;
  return meetsMinTier(user.verificationTier, REQUIRED_TIER.AFFILIATE_BASIC);
}

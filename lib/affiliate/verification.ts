// P4 — Affiliate verification gate. Pure, no framework/DB imports.

import type { User } from "@/backend/core/types";

/**
 * The live database's users.kyc_status uses the richer tier vocabulary
 * declared on User.verificationTier itself ('guest'|'registered'|
 * 'phone_verified'|'profile_complete'|'kyc_submitted'|'kyc_verified'), not
 * the simpler ('unverified'|'pending'|'approved'|'rejected') CHECK
 * constraint checked into supabase/migrations/001_initial_schema.sql — that
 * migration file is stale relative to what's actually deployed (confirmed
 * live: seeded demo accounts return kyc_status values like "kyc_verified"
 * and "profile_complete", which the checked-in CHECK constraint wouldn't
 * even allow Postgres to store). Identity/KYC isn't this module's concern to
 * fix — 'kyc_verified' is simply the top tier of whatever's actually there;
 * treat it as "verified enough to earn."
 */
export function isKycApproved(user: Pick<User, "verificationTier"> | null | undefined): boolean {
  return user?.verificationTier === "kyc_verified";
}

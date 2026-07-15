import type { ProfileSummary, User } from "@/backend/core/types";

export type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  status: string | null;
  tier: string | null;
  kyc_status: string | null;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  profile_completed_at: string | null;
};

export type PreferenceRow = {
  interests: string[] | null;
  travel_style: string | null;
  budget_range: string | null;
  mobility_needs: string | null;
};

export type KycReviewRow = {
  status: string;
  review_reason_code: string | null;
  review_reason_detail: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const TIERS: User["verificationTier"][] = ["email_unverified", "email_verified", "phone_verified", "profile_complete", "kyc_verified"];
const KYC_STATUSES: ProfileSummary["kycStatus"][] = ["unverified", "pending", "approved", "rejected"];
const USER_STATUSES: ProfileSummary["status"][] = ["active", "suspended", "deleted"];

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const value = phone.trim();
  if (value.length <= 4) return "••••";
  const prefix = value.startsWith("+") && value.length > 3 ? value.slice(0, 3) : "";
  return `${prefix}••••${value.slice(-4)}`;
}

function latestReview(rows: KycReviewRow[]): ProfileSummary["latestKycReview"] {
  const row = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!row) return null;
  return {
    status: row.status,
    reasonCode: row.review_reason_code,
    reasonDetail: row.review_reason_detail,
    reviewedAt: row.reviewed_at,
  };
}

export function mapProfileSummary(profile: ProfileRow, preference: PreferenceRow | null, reviews: KycReviewRow[]): ProfileSummary {
  const tier = TIERS.includes(profile.tier as User["verificationTier"]) ? profile.tier as User["verificationTier"] : "email_unverified";
  const kycStatus = KYC_STATUSES.includes(profile.kyc_status as ProfileSummary["kycStatus"]) ? profile.kyc_status as ProfileSummary["kycStatus"] : "unverified";
  const status = USER_STATUSES.includes(profile.status as ProfileSummary["status"]) ? profile.status as ProfileSummary["status"] : "active";
  return {
    id: profile.id,
    email: profile.email ?? "",
    fullName: profile.full_name,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    phone: profile.phone,
    maskedPhone: maskPhone(profile.phone),
    city: profile.city,
    country: profile.country,
    status,
    tier,
    kycStatus,
    emailVerified: Boolean(profile.email_verified_at),
    phoneVerified: Boolean(profile.phone_verified_at),
    profileComplete: Boolean(profile.profile_completed_at),
    survey: preference ? {
      interests: preference.interests ?? [],
      travelStyle: preference.travel_style,
      budgetRange: preference.budget_range,
      mobilityNeeds: preference.mobility_needs,
    } : null,
    latestKycReview: latestReview(reviews),
  };
}

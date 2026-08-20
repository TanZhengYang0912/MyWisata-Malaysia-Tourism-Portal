import { describe, expect, it } from "vitest";
import { mapProfileSummary, maskPhone } from "@/lib/profile/profile-summary";

describe("profile summary", () => {
  it("maps private profile fields and the latest KYC review", () => {
    const result = mapProfileSummary(
      {
        id: "u-1",
        email: "user@example.com",
        full_name: "Aisha Rahman",
        display_name: "Aisha",
        avatar_url: "https://cdn.example/avatar.webp",
        bio: "A traveller who enjoys local food and culture.",
        phone: "+60123456789",
        city: "Kuala Lumpur",
        country: "Malaysia",
        status: "active",
        tier: "profile_complete",
        kyc_status: "rejected",
        email_verified_at: "2026-07-15T00:00:00Z",
        phone_verified_at: "2026-07-15T01:00:00Z",
        profile_completed_at: "2026-07-15T02:00:00Z",
      },
      {
        interests: ["food"],
        budget_range: "mid_range",
        mobility_needs: "none",
        preferred_radius_km: 20,
      },
      [
        { status: "rejected", review_reason_code: "document_incomplete", review_reason_detail: "Upload both sides.", reviewed_at: "2026-07-14T00:00:00Z", created_at: "2026-07-13T00:00:00Z" },
        { status: "pending", review_reason_code: null, review_reason_detail: null, reviewed_at: null, created_at: "2026-07-15T00:00:00Z" },
      ],
    );

    expect(result).toMatchObject({
      id: "u-1",
      fullName: "Aisha Rahman",
      email: "user@example.com",
      maskedPhone: "+60••••6789",
      tier: "profile_complete",
      kycStatus: "rejected",
      emailVerified: true,
      phoneVerified: true,
      profileComplete: true,
      survey: { interests: ["food"], budgetRange: "mid_range", mobilityNeeds: "none", preferredRadiusKm: 20 },
      latestKycReview: { status: "pending", reasonCode: null, reasonDetail: null },
    });
  });

  it("masks a phone number while preserving only the last four digits", () => {
    expect(maskPhone("+60177143951")).toBe("+60••••3951");
    expect(maskPhone(null)).toBeNull();
  });

  it("does not copy public-only fields into the private summary", () => {
    const result = mapProfileSummary(
      { id: "u-2", email: "u@example.com", full_name: null, display_name: null, avatar_url: null, bio: null, phone: null, city: null, country: null, status: "active", tier: "email_verified", kyc_status: "unverified", email_verified_at: null, phone_verified_at: null, profile_completed_at: null },
      null,
      [],
    );
    expect(result).not.toHaveProperty("kycDocuments");
    expect(result).not.toHaveProperty("reviewerId");
  });
});

import { describe, expect, it } from "vitest";
import { mapPublicProfile } from "@/lib/profile/public-profile";

describe("public contributor profile", () => {
  it("exposes bio but strips private fields", () => {
    const row = { id: "u-1", full_name: "Aisha", display_name: null, avatar_url: null, city: "KL", country: "Malaysia", bio: "Loves local food.", is_kyc_verified: true, email: "private@example.com", phone: "+60123456789" };
    expect(mapPublicProfile(row)).toEqual({
      id: "u-1", name: "Aisha", avatarUrl: undefined, city: "KL", country: "Malaysia", bio: "Loves local food.", isKycVerified: true,
    });
  });
});

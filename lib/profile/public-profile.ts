import type { PublicUser } from "@/backend/core/types";

export type PublicProfileRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  bio: string | null;
  is_kyc_verified: boolean;
};

export function mapPublicProfile(row: PublicProfileRow): PublicUser {
  return {
    id: row.id,
    name: row.display_name?.trim() || row.full_name?.trim() || "MyWisata member",
    avatarUrl: row.avatar_url ?? undefined,
    city: row.city ?? undefined,
    country: row.country ?? undefined,
    bio: row.bio ?? undefined,
    isKycVerified: Boolean(row.is_kyc_verified),
  };
}

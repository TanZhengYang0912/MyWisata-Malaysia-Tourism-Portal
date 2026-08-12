import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getVendors, searchActivities } from "@/backend/domains/catalogue";
import { getRecommendedFeed } from "@/backend/domains/recommend";
import { rankFeaturedVendors, rankVendorsByPersonalizedFeed } from "@/backend/domains/vendor-recommend";
import { SearchClient } from "../search/search-client";

export const metadata: Metadata = {
  title: "Partners — MyWisata",
  description: "Discover verified local partners, vendors and businesses across Malaysia.",
};

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function PartnersPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const [results, vendors, recommendationFeed] = await Promise.all([
    searchActivities({ q: q || undefined }, db),
    getVendors(db),
    q ? Promise.resolve([]) : getRecommendedFeed(user?.id ?? null, { limit: 12 }, db),
  ]);
  const approvedVendors = vendors.filter((vendor) => vendor.status === "approved");
  const personalizedVendors = rankVendorsByPersonalizedFeed(approvedVendors, recommendationFeed);
  const recommendationPersonalized = recommendationFeed.some((item) => item.reason !== null) && personalizedVendors.length > 0;
  const recommendedVendors = recommendationPersonalized ? personalizedVendors : rankFeaturedVendors(approvedVendors, results);

  return (
    <SearchClient
      initialQuery={q ?? ""}
      initialResults={results}
      initialVendors={approvedVendors}
      recommendedVendors={recommendedVendors}
      recommendationPersonalized={recommendationPersonalized}
    />
  );
}

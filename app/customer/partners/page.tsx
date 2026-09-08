import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getServerTranslation } from "@/lib/i18n/server";
import { getVendors, searchActivities } from "@/backend/domains/catalogue";
import { getRecommendedFeed } from "@/backend/domains/recommend";
import { rankFeaturedVendors, rankVendorsByPersonalizedFeed } from "@/backend/domains/vendor-recommend";
import type { SponsoredPlacement } from "@/backend/core/types";
import { SearchClient } from "../search/search-client";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation("customer");
  return {
    title: `${t("ui.search.title")} — MyWisata`,
    description: t("ui.search.description"),
  };
}

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function PartnersPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const [results, vendors, recommendationFeed, placementsResult] = await Promise.all([
    searchActivities({ q: q || undefined }, db),
    getVendors(db),
    q ? Promise.resolve([]) : getRecommendedFeed(user?.id ?? null, { limit: 12 }, db),
    db.rpc("list_active_sponsored_discovery_placements"),
  ]);
  const approvedVendors = vendors.filter((vendor) => vendor.status === "approved");
  const personalizedVendors = rankVendorsByPersonalizedFeed(approvedVendors, recommendationFeed);
  const recommendationPersonalized = recommendationFeed.some((item) => item.reason !== null) && personalizedVendors.length > 0;
  const recommendedVendors = recommendationPersonalized ? personalizedVendors : rankFeaturedVendors(approvedVendors, results);
  const sponsoredPlacements = placementsResult.error ? [] : ((placementsResult.data ?? []) as Array<{
    id: string;
    product_id: string;
    state: string | null;
    category_slug: string | null;
    starts_at: string;
    ends_at: string;
    priority: number;
    status: SponsoredPlacement["status"];
  }>).map((placement): SponsoredPlacement => ({
    id: placement.id,
    productId: placement.product_id,
    state: placement.state,
    categorySlug: placement.category_slug,
    startsAt: placement.starts_at,
    endsAt: placement.ends_at,
    priority: placement.priority,
    status: placement.status,
  }));

  return (
    <SearchClient
      initialQuery={q ?? ""}
      initialResults={results}
      initialVendors={approvedVendors}
      recommendedVendors={recommendedVendors}
      recommendationPersonalized={recommendationPersonalized}
      sponsoredPlacements={sponsoredPlacements}
    />
  );
}

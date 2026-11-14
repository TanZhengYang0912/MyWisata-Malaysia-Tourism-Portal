import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getServerTranslation } from "@/lib/i18n/server";
import { filterComputedActivities, getVendors } from "@/backend/domains/catalogue";
import { getCachedComputedActivities, getCachedVendorRatings } from "@/lib/cache/catalogue-cache";
import { getRecommendedFeed } from "@/backend/domains/recommend";
import { rankFeaturedVendors, rankVendorsByPersonalizedFeed } from "@/backend/domains/vendor-recommend";
import { popularVendorProducts } from "@/lib/customer/vendor-page";
import { isOperatingHoursOpenNow } from "@/lib/customer/operating-hours";
import type { SponsoredPlacement, VendorSummary } from "@/backend/core/types";
import { attachSponsoredOutletGalleryCovers } from "@/lib/customer/partner-directory";
import { SearchClient } from "../search/search-client";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";
import { getFeaturedEventPromotions } from "@/lib/customer/event-promotions";
import type { EventPartner } from "@/components/customer/event-partners-section";
import { getMalaysiaDateInputValue } from "@/lib/datetime/date-input";
import { getPublicPromotionCampaigns } from "@/lib/promotion-campaigns/public";
import { nextVendorEvent } from "@/lib/promotion-campaigns/vendor-events";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation("customer");
  return {
    title: `${t("ui.search.title")} — ${BRAND_NAME}`,
    description: t("ui.search.description"),
  };
}

/** Directory cards list approved shop vendors; event vendors appear only under "Event partners". */
function isDirectoryVendor(vendor: VendorSummary) {
  return vendor.status === "approved" && vendor.kind !== "event";
}

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function PartnersPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  // Public catalogue from the shared 60 s cache (same as Home and Explore), filtered per request.
  const resultsPromise = getCachedComputedActivities().then((activities) => filterComputedActivities({ q: q || undefined }, activities));
  const recommendationPromise = q
    ? Promise.resolve([])
    : resultsPromise.then((results) => getRecommendedFeed(
      user?.id ?? null,
      { limit: 12, candidates: results },
      db,
    ));
  const vendorsPromise = getVendors(db);
  const [results, vendors, recommendationFeed, placementsResult, eventPromotions, publicEvents, vendorRatings] = await Promise.all([
    resultsPromise,
    vendorsPromise,
    recommendationPromise,
    db.rpc("list_active_sponsored_discovery_placements"),
    getFeaturedEventPromotions(createServiceClient()).catch(() => []),
    getPublicPromotionCampaigns(),
    // Ratings start as soon as the vendor list is in, not after every other read.
    vendorsPromise
      .then((all) => getCachedVendorRatings(all.filter(isDirectoryVendor).map((vendor) => vendor.id).sort()))
      .then((entries) => new Map(entries))
      .catch(() => null),
  ]);
  // Event vendors never appear in the normal directory — only under "Event partners".
  const directoryVendors = vendors.filter(isDirectoryVendor);
  const approvedVendors = directoryVendors.map((vendor) => ({
    ...vendor,
    rating: vendorRatings ? vendorRatings.get(vendor.id) ?? null : undefined,
    openNow: vendor.outlets.some((outlet) => outlet.currentlyOpen ?? isOperatingHoursOpenNow(outlet.operatingHours)),
    popularProducts: popularVendorProducts(results, vendor.id),
  }));
  const today = getMalaysiaDateInputValue();
  const eventPartners: EventPartner[] = vendors
    .filter((vendor) => vendor.status === "approved" && vendor.kind === "event")
    .map((vendor) => {
      const next = nextVendorEvent(publicEvents.campaigns, vendor.id, today);
      return {
        id: vendor.id,
        name: vendor.name,
        logoUrl: vendor.logoUrl,
        next: next && { campaignTitle: next.campaignTitle, locationName: next.location.name, startsOn: next.location.startsOn, endsOn: next.location.endsOn },
      };
    })
    // Partners with an upcoming event first, soonest first.
    .sort((a, b) => (a.next?.startsOn ?? "9999").localeCompare(b.next?.startsOn ?? "9999") || a.name.localeCompare(b.name));
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
  const sponsoredProductIds = new Set(sponsoredPlacements.map((placement) => placement.productId));
  const sponsoredOutletIds = [...new Set(results
    .filter((activity) => sponsoredProductIds.has(activity.id))
    .map((activity) => activity.outlet.id))];
  let partnerResults = results;
  if (sponsoredOutletIds.length > 0) {
    const { data: outletMediaRows, error: outletMediaError } = await db
      .from("media_assets")
      .select("outlet_id,url,alt_text,media_type,sort_order")
      .in("outlet_id", sponsoredOutletIds)
      .is("product_id", null)
      .order("sort_order");
    if (!outletMediaError) {
      partnerResults = attachSponsoredOutletGalleryCovers(
        results,
        sponsoredProductIds,
        (outletMediaRows ?? []).map((media) => ({
          outletId: media.outlet_id,
          url: media.url,
          altText: media.alt_text,
          mediaType: media.media_type,
          sortOrder: media.sort_order,
        })),
      );
    }
  }

  return (
    <SearchClient
      initialQuery={q ?? ""}
      initialResults={partnerResults}
      initialVendors={approvedVendors}
      recommendedVendors={recommendedVendors}
      sponsoredPlacements={sponsoredPlacements}
      eventPromotions={q ? [] : eventPromotions}
      eventPartners={eventPartners}
    />
  );
}

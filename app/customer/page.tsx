import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getServerTranslation } from "@/lib/i18n/server";
import { getRecommendedFeed } from "@/backend/domains/recommend";
import type { ReasonTag } from "@/backend/domains/recommend-score";
import { rankFeaturedVendors } from "@/backend/domains/vendor-recommend";
import { getVendorRatingSummaries } from "@/backend/domains/vendor-reviews";
import { getCachedComputedActivities } from "@/lib/cache/catalogue-cache";
import { selectEntityGallery, selectEntityLogo, type EntityMediaRow } from "@/lib/customer/entity-media";
import { getVendorVisual } from "@/lib/customer/vendor-visual";
import { popularVendorProducts } from "@/lib/customer/vendor-page";
import { isOperatingHoursOpenNow } from "@/lib/customer/operating-hours";
import type { ComputedActivity, OperatingHours } from "@/backend/core/types";
import { CustomerHomeClient } from "./customer-home-client";
import { selectFeaturedPublicCampaigns } from "@/lib/customer/promotion-campaigns";
import { resolvePromotionCampaignImages } from "@/lib/promotion-campaigns/images";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";
import type { EventPartner } from "@/components/customer/event-partners-section";
import { getMalaysiaDateInputValue } from "@/lib/datetime/date-input";
import { nextVendorEvent } from "@/lib/promotion-campaigns/vendor-events";
import { Instrument_Serif } from "next/font/google";

const discoverTitleFont = Instrument_Serif({
  variable: "--font-discover-title",
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  display: "swap",
});

export default async function CustomerHomePage() {
  const db = await createClient();
  const { t } = await getServerTranslation("customer");

  // Localize the dominant recommendation reason for the request's language.
  // Literal `customer:` keys so the i18n extractor attributes them correctly even
  // though this helper is nested inside the component.
  const reasonLabel = (reason: ReasonTag | null): string | undefined => {
    switch (reason) {
      case "near_you": return t("customer:ui.recommendationReasons.near_you");
      case "interests": return t("customer:ui.recommendationReasons.interests");
      case "similar": return t("customer:ui.recommendationReasons.similar");
      case "hidden_gem": return t("customer:ui.recommendationReasons.hidden_gem");
      default: return undefined;
    }
  };
  const [{ data: { user } }, activities, vendorRows, campaignResult] = await Promise.all([
    db.auth.getUser(),
    // Cached for 60 s — same data for all visitors, no user-specific filtering
    getCachedComputedActivities(),
    db
      .from("vendors")
      .select("id,name,description,logo_url,cover_url,business_type,outlets(id,name,city,state,status,review_status,operating_hours)")
      .eq("status", "approved")
      .eq("kind", "shop")
      .order("name")
      .limit(24),
    db.rpc("get_public_promotion_campaigns", { p_slug: null }),
  ]);

  const publicCampaigns = resolvePromotionCampaignImages(Array.isArray(campaignResult.data) ? campaignResult.data as unknown as PromotionCampaignPublic[] : []);
  const eventVendorIds = Array.from(new Set(publicCampaigns.flatMap((campaign) => campaign.vendors.map((vendor) => vendor.vendorId))));
  const vendorIds = Array.from(new Set([...(vendorRows.data ?? []).map((vendor) => vendor.id), ...eventVendorIds]));
  const [feed, vendorMediaRows, eventPartnerVendorResult] = await Promise.all([
    getRecommendedFeed(user?.id ?? null, { limit: 8, candidates: activities }, db),
    vendorIds.length
      ? db
        .from("media_assets")
        .select("vendor_id,url,alt_text,media_type,sort_order")
        .in("vendor_id", vendorIds)
        .is("outlet_id", null)
        .is("product_id", null)
        .order("sort_order")
        .then(({ data }) => data ?? [])
      : Promise.resolve([]),
    eventVendorIds.length
      ? db
        .from("vendors")
        .select("id,name,description,logo_url,cover_url")
        .eq("status", "approved")
        .in("id", eventVendorIds)
      : Promise.resolve({ data: [] }),
  ]);

  const recommended = feed.map((item) => ({
    ...item.activity,
    aiTag: reasonLabel(item.reason),
  })) as ComputedActivity[];

  const mediaByVendorId = new Map<string, EntityMediaRow[]>();
  for (const row of vendorMediaRows) {
    const rows = mediaByVendorId.get(row.vendor_id) ?? [];
    rows.push({ url: row.url, altText: row.alt_text, mediaType: row.media_type, sortOrder: row.sort_order });
    mediaByVendorId.set(row.vendor_id, rows);
  }

  const vendors = (vendorRows.data ?? [])
    .map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      description: vendor.description,
      logoUrl: getVendorVisual({ name: vendor.name, logoUrl: vendor.logo_url }).logoUrl
        ?? selectEntityLogo(mediaByVendorId.get(vendor.id) ?? []),
      coverUrl: vendor.cover_url,
      businessType: vendor.business_type,
      outlets: (vendor.outlets ?? [])
        .filter((outlet) => outlet.status === "active" && outlet.review_status === "approved")
        .map((outlet) => ({ id: outlet.id, name: outlet.name, city: outlet.city, state: outlet.state })),
      // ponytail: open-now is computed per request on the server; it can lag until the next request.
      openNow: (vendor.outlets ?? []).some((outlet) => outlet.status === "active" && outlet.review_status === "approved" && isOperatingHoursOpenNow(outlet.operating_hours as OperatingHours | null)),
    }))
    .filter((vendor) => vendor.outlets.length > 0);

  const rankedVendors = rankFeaturedVendors(vendors, activities, 24);
  // Ratings read the review metrics view with the service client, as the vendor page does; a failure only hides the line.
  const vendorRatings = await getVendorRatingSummaries(rankedVendors.map((vendor) => vendor.id), createServiceClient()).catch(() => new Map<string, { value: number; count: number }>());
  const featuredVendors = rankedVendors.map((vendor) => ({ ...vendor, rating: vendorRatings.get(vendor.id), popularProducts: popularVendorProducts(activities, vendor.id) }));
  const featuredCampaigns = selectFeaturedPublicCampaigns(publicCampaigns);
  const today = getMalaysiaDateInputValue();
  const featuredEventPartners: EventPartner[] = (eventPartnerVendorResult.data ?? [])
    .map((vendor) => {
      const mediaRows = mediaByVendorId.get(vendor.id) ?? [];
      const visual = getVendorVisual({ name: vendor.name, logoUrl: vendor.logo_url, coverUrl: vendor.cover_url });
      const next = nextVendorEvent(publicCampaigns, vendor.id, today);
      return {
        id: vendor.id,
        name: vendor.name,
        description: vendor.description,
        logoUrl: visual.logoUrl ?? selectEntityLogo(mediaRows),
        coverUrl: visual.coverUrl ?? selectEntityGallery(mediaRows, 1)[0]?.url ?? null,
        next: next && {
          campaignTitle: next.campaignTitle,
          locationName: next.location.name,
          startsOn: next.location.startsOn,
          endsOn: next.location.endsOn,
        },
      };
    })
    .filter((partner) => partner.next)
    .sort((a, b) => (a.next?.startsOn ?? "9999").localeCompare(b.next?.startsOn ?? "9999") || a.name.localeCompare(b.name));

  return <CustomerHomeClient titleFontClassName={discoverTitleFont.variable} popular={activities} recommended={recommended} vendors={featuredVendors} eventPartners={featuredEventPartners} campaign={featuredCampaigns[0] ?? null} campaigns={featuredCampaigns} campaignUnavailable={Boolean(campaignResult.error)} />;
}

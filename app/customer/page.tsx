import { createClient } from "@/lib/supabase/server";
import { getRecommendedFeed } from "@/backend/domains/recommend";
import { rankFeaturedVendors } from "@/backend/domains/vendor-recommend";
import { getCachedComputedActivities } from "@/lib/cache/catalogue-cache";
import { selectEntityLogo, type EntityMediaRow } from "@/lib/customer/entity-media";
import { getVendorVisual } from "@/lib/customer/vendor-visual";
import type { ComputedActivity } from "@/backend/core/types";
import { CustomerHomeClient } from "./customer-home-client";

export default async function CustomerHomePage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  const [activities, feed, vendorRows] = await Promise.all([
    // Cached for 60 s — same data for all visitors, no user-specific filtering
    getCachedComputedActivities(),
    getRecommendedFeed(user?.id ?? null, { limit: 8 }, db),
    db
      .from("vendors")
      .select("id,name,description,logo_url,cover_url,business_type,outlets(id,name,city,state,status,review_status)")
      .eq("status", "approved")
      .order("name")
      .limit(24),
  ]);

  const recommended = feed.map((item) => ({
    ...item.activity,
    aiTag: item.reasonLabel ?? undefined,
  })) as ComputedActivity[];

  const vendorIds = (vendorRows.data ?? []).map((vendor) => vendor.id);
  const vendorMediaRows = vendorIds.length
    ? (await db
      .from("media_assets")
      .select("vendor_id,url,alt_text,media_type,sort_order")
      .in("vendor_id", vendorIds)
      .is("outlet_id", null)
      .is("product_id", null)
      .order("sort_order")).data ?? []
    : [];
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
    }))
    .filter((vendor) => vendor.outlets.length > 0);

  const featuredVendors = rankFeaturedVendors(vendors, activities, 24);

  return <CustomerHomeClient popular={activities} recommended={recommended} vendors={featuredVendors} />;
}

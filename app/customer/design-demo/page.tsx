import { createClient } from "@/lib/supabase/server";
import { searchActivities } from "@/backend/domains/catalogue";
import { getRecommendedFeed } from "@/backend/domains/recommend";
import { rankFeaturedVendors } from "@/backend/domains/vendor-recommend";
import type { ComputedActivity } from "@/backend/core/types";
import { DesignDemoClient } from "./design-demo-client";

type DesignDemoPageProps = {
  searchParams: Promise<{ state?: string }>;
};

export default async function CustomerHomeDesignDemoPage({ searchParams }: DesignDemoPageProps) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const { state } = await searchParams;

  const [activities, feed, vendorRows] = await Promise.all([
    searchActivities({ state: "All Malaysia", category: null }, db),
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

  const vendors = (vendorRows.data ?? [])
    .map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      description: vendor.description,
      logoUrl: vendor.logo_url,
      coverUrl: vendor.cover_url,
      businessType: vendor.business_type,
      outlets: (vendor.outlets ?? [])
        .filter((outlet) => outlet.status === "active" && outlet.review_status === "approved")
        .map((outlet) => ({ id: outlet.id, name: outlet.name, city: outlet.city, state: outlet.state })),
    }))
    .filter((vendor) => vendor.outlets.length > 0)
  const featuredVendors = rankFeaturedVendors(vendors, activities, 24);

  return <DesignDemoClient key={state ?? "all-malaysia"} activities={activities} recommended={recommended} vendors={featuredVendors} initialState={state} />;
}

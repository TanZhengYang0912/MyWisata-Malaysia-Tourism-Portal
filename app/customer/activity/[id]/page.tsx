// P4 — Member 4: Open Graph tags for the activity page (Step 3).
// This page had no metadata export before — the whole thing was a Client
// Component (see activity-detail-client.tsx), and generateMetadata() can only
// be exported from a Server Component. Split into this thin server wrapper +
// the pre-existing client component so shared links preview properly
// (WhatsApp, etc.) without touching how the page fetches its own data.
//
// Now also fetches the activity + booking slots server-side (SSR) and passes
// them as props, so the page has real content on first paint instead of a
// client-only "Loading…" flash, and is crawlable/shareable.

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getBookingSlots, getComputedActivity, getOutletChoices, getProductReviews, getOutletActivities, getVendorActivities } from "@/backend/domains/catalogue";
import { buildActivityMetadata } from "@/lib/affiliate/activity-metadata";
import { ActivityDetailClient } from "./activity-detail-client";

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ outletId?: string; source?: string; returnTo?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return buildActivityMetadata(id, `/customer/activity/${id}`);
}

export default async function ActivityDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const db = await createClient();
  const activity = await getComputedActivity(id, undefined, db);
  const [slots, reviews, outletChoices] = activity
    ? await Promise.all([
        activity.requiresBooking ? getBookingSlots(activity.id, db) : Promise.resolve([]),
        // The client pre-selects activity.outletId (the outlet toComputed()
        // picked), so the SSR preview must be scoped to that same outlet —
        // otherwise the first paint shows all-outlets reviews under a
        // single-outlet header.
        getProductReviews(activity.id, db, { outletId: activity.outletId }),
        getOutletChoices(activity, db),
      ])
    : [[], [], []];
  const sp = await searchParams;
  const requestedOutletId = sp?.outletId;
  const selectedOutletId = requestedOutletId && outletChoices.some((choice) => choice.outletId === requestedOutletId)
    ? requestedOutletId
    : activity?.outletId;
  const returnToParam = sp?.returnTo ? decodeURIComponent(sp.returnTo) : "";
  const isVendorSource = sp?.source === "vendor" || returnToParam.includes("/customer/vendor");
  const vendorId = activity?.outlet.vendorId;
  const relatedProducts =
    isVendorSource && vendorId
      ? await getVendorActivities(vendorId, activity!.id, db)
      : selectedOutletId && activity
        ? await getOutletActivities(selectedOutletId, activity.id, db)
        : [];
  const relatedScope: "vendor" | "outlet" = isVendorSource && vendorId ? "vendor" : "outlet";

  return (
    <ActivityDetailClient
      initialActivity={activity}
      initialSlots={slots}
      initialReviews={reviews}
      outletChoices={outletChoices}
      relatedProducts={relatedProducts}
      relatedScope={relatedScope}
    />
  );
}

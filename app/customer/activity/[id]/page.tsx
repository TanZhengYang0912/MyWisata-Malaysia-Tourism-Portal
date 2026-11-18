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
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import { getBookingSlots, getOutletActivities, getVendorActivities } from "@/backend/domains/catalogue";
import { buildActivityMetadata } from "@/lib/affiliate/activity-metadata";
import { getCachedDiscoveryActivityData, getCachedPublicProductPage } from "@/lib/cache/catalogue-cache";
import { ActivityDetailClient } from "./activity-detail-client";

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ outletId?: string; source?: string; returnTo?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return buildActivityMetadata(id, `/customer/products/${encodeURIComponent(id)}`);
}

export default async function ActivityDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const requestedOutletId = sp?.outletId;
  const db = await createClient();
  // Booking slots are live availability, so they are read per request, alongside the cached public page data.
  // Read speculatively by product id: a product that takes no bookings just has no slots.
  const slotsPromise = getBookingSlots(id, db).catch(() => null);
  // The product, its outlet choices and its first reviews come from the shared 60 s public cache. The
  // outlet-specific entry is used only for one of the product's own outlets, which keeps entries bounded.
  const defaultPage = await getCachedPublicProductPage(id, undefined);
  const productOutletIds = defaultPage ? [defaultPage.activity.outletId, ...(defaultPage.activity.offers ?? []).map((offer) => offer.outletId)] : [];
  const publicPage = defaultPage && requestedOutletId && requestedOutletId !== defaultPage.activity.outletId && productOutletIds.includes(requestedOutletId)
    ? await getCachedPublicProductPage(id, requestedOutletId)
    : defaultPage;
  const activity = publicPage?.activity ?? null;
  // Rooms are booked only from their hotel page; old links to a room land there instead.
  if (activity?.categorySlug === "accommodation") redirect(getOutletShopHref(requestedOutletId ?? activity.outletId));
  // The client pre-selects activity.outletId (the outlet toComputed() picked), and the cached reviews are scoped
  // to that same outlet, so the first paint never shows all-outlets reviews under a single-outlet header.
  const reviews = publicPage?.reviews ?? [];
  const outletChoices = publicPage?.outletChoices ?? [];
  const [bookingSlots, catalogue] = activity
    ? await Promise.all([
        slotsPromise,
        // Related products come from the shared 60 s public catalogue, not a fresh full-catalogue read.
        getCachedDiscoveryActivityData(),
      ])
    : [[], undefined];
  // A failed slot read only matters for a product that takes bookings; it fails the page as before.
  if (activity?.requiresBooking && bookingSlots === null) throw new Error("Booking slots are unavailable");
  const slots = activity?.requiresBooking ? bookingSlots ?? [] : [];
  const selectedOutletId = requestedOutletId && outletChoices.some((choice) => choice.outletId === requestedOutletId)
    ? requestedOutletId
    : activity?.outletId;
  const returnToParam = sp?.returnTo ?? "";
  const isVendorSource = sp?.source === "vendor" || returnToParam.includes("/customer/vendor");
  const vendorId = activity?.outlet.vendorId;
  const relatedProducts = (
    isVendorSource && vendorId
      ? await getVendorActivities(vendorId, activity!.id, db, catalogue ?? undefined)
      : selectedOutletId && activity
        ? await getOutletActivities(selectedOutletId, activity.id, db, catalogue ?? undefined)
        : []
  ).filter((related) => related.categorySlug !== "accommodation");
  const relatedScope: "vendor" | "outlet" = isVendorSource && vendorId ? "vendor" : "outlet";

  return (
    <ActivityDetailClient
      key={`${activity?.id ?? id}:${selectedOutletId ?? ""}`}
      initialActivity={activity}
      initialSlots={slots}
      initialReviews={reviews}
      outletChoices={outletChoices}
      relatedProducts={relatedProducts}
      relatedScope={relatedScope}
    />
  );
}

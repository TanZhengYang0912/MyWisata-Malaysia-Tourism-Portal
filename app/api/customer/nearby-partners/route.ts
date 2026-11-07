import { getNearbyOutlets } from "@/backend/domains/places";
import { getVendorRatingSummaries } from "@/backend/domains/vendor-reviews";
import { cityCentre, parseRecommendationCoordinates } from "@/lib/personalization/location";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { apiFail, apiOk } from "@/lib/validation/schemas";
import { z } from "zod";

const NEARBY_RADIUS_KM = 20;
const RESULT_LIMIT = 4;

const nearbyPartnersRequestSchema = z.object({
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
}).strict().refine(
  ({ latitude, longitude }) => (latitude === undefined) === (longitude === undefined),
  "Latitude and longitude must be supplied together",
);

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiFail("VALIDATION_FAILED", "Request body must be valid JSON", 422);
  }

  const parsedBody = nearbyPartnersRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return apiFail("VALIDATION_FAILED", "Location coordinates are invalid", 422);
  }

  try {
    const db = await createClient();
    const browserOrigin = parseRecommendationCoordinates(parsedBody.data);
    let origin = browserOrigin;
    let locationSource: "browser" | "city" | "none" = browserOrigin ? "browser" : "none";

    if (!origin) {
      const { data: { user } } = await db.auth.getUser();
      if (user) {
        const { data: profile, error: profileError } = await db
          .from("users")
          .select("city")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) return apiFail("PROFILE_UNAVAILABLE", "Unable to read your profile city", 503);
        origin = await cityCentre(profile?.city);
        if (origin) locationSource = "city";
      }
    }

    if (!origin) return apiOk({ locationSource: "none" as const, partners: [] });

    const nearbyOutlets = await getNearbyOutlets(origin, NEARBY_RADIUS_KM, db);
    const closestOutletByVendor = new Map<string, (typeof nearbyOutlets)[number]>();
    for (const nearby of nearbyOutlets) {
      if (!closestOutletByVendor.has(nearby.outlet.vendorId)) {
        closestOutletByVendor.set(nearby.outlet.vendorId, nearby);
      }
    }

    const vendorIds = [...closestOutletByVendor.keys()];
    if (vendorIds.length === 0) return apiOk({ locationSource, partners: [] });

    const { data: vendors, error: vendorsError } = await db
      .from("vendors")
      .select("id,name,description,logo_url,cover_url")
      .in("id", vendorIds)
      .eq("status", "approved")
      .eq("kind", "shop");
    if (vendorsError) return apiFail("PARTNERS_UNAVAILABLE", "Unable to load nearby partners", 503);

    const vendorById = new Map((vendors ?? []).map((vendor) => [vendor.id, vendor]));
    // A failed lookup (unknown rating) hides the badge; no reviews shows "No reviews yet".
    const ratings = await getVendorRatingSummaries(vendorIds, createServiceClient()).catch(() => null);
    const partners = [...closestOutletByVendor.entries()]
      .flatMap(([vendorId, nearby]) => {
        const vendor = vendorById.get(vendorId);
        if (!vendor) return [];
        return [{
          id: vendor.id,
          name: vendor.name,
          description: vendor.description,
          logoUrl: vendor.logo_url ?? nearby.outlet.vendorLogoUrl ?? null,
          coverUrl: vendor.cover_url ?? nearby.outlet.coverUrl ?? null,
          outlets: [{
            id: nearby.outlet.id,
            name: nearby.outlet.name,
            city: nearby.outlet.city || null,
            state: nearby.outlet.state || null,
          }],
          distanceKm: nearby.km,
          rating: ratings ? ratings.get(vendor.id) ?? null : undefined,
          // Only the closest outlet is known here, so the status is that outlet's.
          openNow: nearby.outlet.currentlyOpen ?? nearby.outlet.open,
        }];
      })
      .slice(0, RESULT_LIMIT);

    return apiOk({ locationSource, partners });
  } catch {
    return apiFail("PARTNERS_UNAVAILABLE", "Unable to load nearby partners", 503);
  }
}

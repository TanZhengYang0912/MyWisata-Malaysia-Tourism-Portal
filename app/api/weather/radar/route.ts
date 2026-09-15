import { getTripById, getTripItems } from "@/backend/domains/trips";
import { getTripDayDates, isValidTripCoordinate } from "@/lib/customer/trip-planner";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk } from "@/lib/validation/schemas";
import { malaysiaDateHour } from "@/lib/weather/overlay-time";
import { getRainViewerRadar } from "@/lib/weather/rainviewer";
import { weatherRadarRequestSchema } from "@/lib/weather/schema";
import { consumeWeatherRadarRateLimit, withWeatherRadarProviderSlot } from "./route-state";

export const dynamic = "force-dynamic";

function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  try {
    const db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return privateResponse(apiFail("UNAUTHORIZED", "Sign in required", 401));
    if (!consumeWeatherRadarRateLimit(user.id)) {
      return privateResponse(apiFail("RATE_LIMITED", "Too many radar requests. Please try again shortly.", 429));
    }

    const url = new URL(request.url);
    const queryKeys = [...url.searchParams.keys()];
    if (queryKeys.length !== 1 || queryKeys[0] !== "tripId" || url.searchParams.getAll("tripId").length !== 1) {
      return privateResponse(apiFail("VALIDATION_FAILED", "Request query failed validation", 422));
    }
    const parsed = weatherRadarRequestSchema.safeParse({ tripId: url.searchParams.get("tripId") });
    if (!parsed.success) {
      return privateResponse(apiFail("VALIDATION_FAILED", "Request query failed validation", 422, parsed.error.flatten()));
    }

    const trip = await getTripById(parsed.data.tripId, db);
    if (!trip) return privateResponse(apiFail("TRIP_NOT_FOUND", "Trip not found", 404));
    if (trip.user_id !== user.id) return privateResponse(apiFail("FORBIDDEN", "Trip access denied", 403));

    const today = malaysiaDateHour(new Date()).date;
    if (!getTripDayDates(trip).includes(today)) {
      return privateResponse(apiFail("DATE_NOT_IN_TRIP", "Live radar is available only during this trip", 403));
    }

    const items = await getTripItems(parsed.data.tripId, db);
    if (!items.some((item) => isValidTripCoordinate(item.lat, item.lng))) {
      return privateResponse(apiFail("NO_VALID_COORDINATES", "Trip has no valid weather coordinates", 422));
    }

    const radar = await withWeatherRadarProviderSlot(() => getRainViewerRadar());
    return privateResponse(apiOk(radar));
  } catch {
    return privateResponse(apiFail("RADAR_UNAVAILABLE", "Live radar is temporarily unavailable", 500));
  }
}

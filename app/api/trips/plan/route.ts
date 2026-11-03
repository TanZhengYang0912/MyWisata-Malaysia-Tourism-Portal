import { z } from "zod";
import { getTripById, getTripItems } from "@/backend/domains/trips";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import { customerCapabilityFailure, resolveServerCustomerCapability } from "@/lib/auth/customer-capabilities.server";
import { createClient } from "@/lib/supabase/server";
import { generateTripSuggestions, getTripCopilotCandidates, resolveTripSuggestionScope } from "@/lib/customer/trip-copilot";
import type { ChatLanguage } from "@/lib/chatbot/language";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { consumeTripPlanRateLimit } from "./route-state";
import { reserveAiQuota } from "@/lib/rate-limit/ai";
import { reserveGuestRateLimit } from "@/lib/checkout/guest-session";
import { withPortalWorkload, WorkloadUnavailableError } from "@/lib/operations/workload";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  tripId: z.string().trim().min(1).max(128),
  preference: z.string().trim().max(140).default(""),
  locale: z.enum(["en", "ms", "zh-CN"]),
  selectedState: z.string().trim().max(40).optional(),
}).strict();

function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return privateResponse(apiFail("UNAUTHORIZED", "Sign in required", 401));

  const decision = await resolveServerCustomerCapability(user.id, CUSTOMER_CAPABILITY.BASIC_AI);
  const capabilityError = customerCapabilityFailure(
    CUSTOMER_CAPABILITY.BASIC_AI,
    decision,
    "Phone verification is required before using AI trip planning",
  );
  if (capabilityError) return privateResponse(capabilityError);

  const parsed = await parseBody(request, requestSchema, { maxBytes: 4_096 });
  if (!parsed.ok) return privateResponse(parsed.response);
  if (!consumeTripPlanRateLimit(user.id)) {
    return privateResponse(apiFail("RATE_LIMITED", "Too many trip planning requests. Please try again shortly.", 429));
  }

  try {
    const trip = await getTripById(parsed.data.tripId, db);
    if (!trip) return privateResponse(apiFail("TRIP_NOT_FOUND", "Trip not found", 404));
    if (trip.user_id !== user.id) return privateResponse(apiFail("FORBIDDEN", "Trip access denied", 403));

    const tripItems = await getTripItems(parsed.data.tripId, db);
    const scope = resolveTripSuggestionScope(parsed.data.preference, trip.name, parsed.data.selectedState);
    if (scope.ambiguousStates.length > 0) {
      return privateResponse(apiOk({ mode: "needs-destination", suggestions: [], scope }));
    }
    const candidates = await getTripCopilotCandidates({
      state: scope.state,
      categorySlug: scope.categorySlug,
      preference: parsed.data.preference,
      excludeProductIds: tripItems.flatMap((item) => item.experience_id ? [item.experience_id] : []),
    }, db);
    const language: ChatLanguage = parsed.data.locale === "ms" ? "bm" : parsed.data.locale === "zh-CN" ? "zh" : "en";
    const tripInfo = {
      name: trip.name,
      startDate: trip.start_date,
      endDate: trip.end_date,
    };
    const allowExternal = await reserveAiQuota(request, 'trip-plan', user.id, 8)
      && await reserveGuestRateLimit('ai:trip-plan:all', 20, 60);
    let result;
    try {
      result = allowExternal
        ? await withPortalWorkload('trip_ai', (signal) => generateTripSuggestions(tripInfo, candidates, language, parsed.data.preference, { signal }), request.signal)
        : await generateTripSuggestions(tripInfo, candidates, language, parsed.data.preference, { allowExternal: false });
    } catch (error) {
      if (!(error instanceof WorkloadUnavailableError)) throw error;
      result = await generateTripSuggestions(tripInfo, candidates, language, parsed.data.preference, { allowExternal: false });
    }
    const candidatesById = new Map(candidates.map((candidate) => [candidate.productId, candidate]));

    return privateResponse(apiOk({
      mode: result.mode,
      scope,
      suggestions: result.suggestions.flatMap((suggestion) => {
        const candidate = candidatesById.get(suggestion.productId);
        return candidate ? [{
          ...suggestion,
          lat: candidate.lat,
          lng: candidate.lng,
          price: candidate.price,
          rating: candidate.rating,
          image: candidate.image,
          category: candidate.category,
        }] : [];
      }),
    }));
  } catch {
    return privateResponse(apiFail("TRIP_PLAN_UNAVAILABLE", "Trip suggestions are temporarily unavailable", 500));
  }
}

import { z } from "zod";
import { getTripById, getTripItems } from "@/backend/domains/trips";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import { customerCapabilityFailure, resolveServerCustomerCapability } from "@/lib/auth/customer-capabilities.server";
import { createClient } from "@/lib/supabase/server";
import { generateTripSuggestions, getTripCopilotCandidates, resolveTripSuggestionScope, ruleBasedTripSuggestions } from "@/lib/customer/trip-copilot";
import type { ChatLanguage } from "@/lib/chatbot/language";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { consumeTripPlanRateLimit } from "./route-state";
import { reserveAiQuota } from "@/lib/rate-limit/ai";
import { reserveGuestRateLimit } from "@/lib/checkout/guest-session";
import { withPortalWorkload, WorkloadUnavailableError } from "@/lib/operations/workload";
import { parseTripPlanIntent } from "@/lib/customer/trip-plan-intent";
import { getTripDiscoveryAnchor } from "@/lib/customer/trip-planner";
import { orderTripStops, type RouteOrderStop } from "@/lib/customer/trip-route-order";
import { consumeRouteRateLimit, withRouteProviderSlot } from "@/app/api/route/route-state";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  tripId: z.string().trim().min(1).max(128),
  preference: z.string().trim().max(140).default(""),
  locale: z.enum(["en", "ms", "zh-CN"]),
  selectedState: z.string().trim().max(40).optional(),
  selectedDate: z.string().date().nullable().optional(),
  travelMode: z.enum(["DRIVING", "WALKING", "BICYCLING", "TRANSIT"]).default("DRIVING"),
}).strict();

async function getTravelMatrix(stops: RouteOrderStop[], userId: string, travelMode: "DRIVING" | "WALKING" | "BICYCLING" | "TRANSIT", signal?: AbortSignal): Promise<number[][] | undefined> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  const profile = travelMode === "WALKING" ? "walking" : travelMode === "BICYCLING" ? "cycling" : travelMode === "DRIVING" ? "driving" : null;
  if (!token || !profile || stops.length < 2 || stops.length > 25 || !consumeRouteRateLimit(userId)) return undefined;
  const work = async () => {
    try {
      const response = await fetch(`https://api.mapbox.com/directions-matrix/v1/mapbox/${profile}/${stops.map((stop) => `${stop.lng},${stop.lat}`).join(";")}?annotations=duration&access_token=${encodeURIComponent(token)}`, {
        cache: "no-store", signal, redirect: "error",
      });
      if (!response.ok) return undefined;
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("durations" in result) || !Array.isArray(result.durations)) return undefined;
      const durations = result.durations as unknown[];
      if (durations.length !== stops.length || durations.some((row) => !Array.isArray(row) || row.length !== stops.length || row.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0))) return undefined;
      return durations as number[][];
    } catch { return undefined; }
  };
  return (await withRouteProviderSlot(work, signal)) ?? undefined;
}

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
    const intent = parseTripPlanIntent(parsed.data.preference, trip, parsed.data.selectedDate ?? trip.start_date);
    if (intent.needsCategory) {
      return privateResponse(apiOk({ mode: "needs-category", suggestions: [], scope: null, directAdd: false }));
    }
    if (intent.limitExceeded) {
      return privateResponse(apiOk({ mode: "limit-exceeded", suggestions: [], scope: null, directAdd: false }));
    }
    if (intent.directAdd && (intent.needsDay || !intent.targetDate)) {
      return privateResponse(apiOk({ mode: "needs-day", suggestions: [], scope: null, directAdd: true, invalidDay: intent.invalidDay }));
    }
    const scope = resolveTripSuggestionScope(parsed.data.preference, trip.name, parsed.data.selectedState);
    if (scope.ambiguousStates.length > 0) {
      return privateResponse(apiOk({ mode: "needs-destination", suggestions: [], scope, directAdd: intent.directAdd }));
    }
    const anchor = getTripDiscoveryAnchor(tripItems, intent.targetDate ?? trip.start_date);
    if (intent.directAdd && !scope.state && !anchor) {
      return privateResponse(apiOk({ mode: "needs-destination", suggestions: [], scope: null, directAdd: true }));
    }
    const commonCandidateFilters = {
      state: scope.state,
      preference: parsed.data.preference,
      excludeProductIds: tripItems.flatMap((item) => item.experience_id ? [item.experience_id] : []),
      near: anchor,
    };
    const candidateGroups = intent.directAdd
      ? intent.groups
      : [];
    const candidateBatches = candidateGroups.length > 0
      ? [await getTripCopilotCandidates({
        ...commonCandidateFilters,
        categorySlugs: [...new Set(candidateGroups.map((group) => group.categorySlug))],
        limit: 30,
      }, db)]
      : [await getTripCopilotCandidates({
        ...commonCandidateFilters,
        categorySlug: intent.categorySlug ?? scope.categorySlug,
      }, db)];
    const candidates = [...new Map(candidateBatches.flat().map((candidate) => [candidate.productId, candidate])).values()].slice(0, 30);
    const language: ChatLanguage = parsed.data.locale === "ms" ? "bm" : parsed.data.locale === "zh-CN" ? "zh" : "en";
    const tripInfo = {
      name: trip.name,
      startDate: trip.start_date,
      endDate: trip.end_date,
    };
    const allowExternal = await reserveAiQuota(request, 'trip-plan', user.id, 8)
      && await reserveGuestRateLimit('ai:trip-plan:all', 20, 60);
    let result;
    const suggestionLimit = intent.directAdd ? intent.requestedTotal : undefined;
    try {
      result = allowExternal
        ? await withPortalWorkload('trip_ai', (signal) => generateTripSuggestions(tripInfo, candidates, language, parsed.data.preference, { signal, limit: suggestionLimit }), request.signal)
        : await generateTripSuggestions(tripInfo, candidates, language, parsed.data.preference, { allowExternal: false, limit: suggestionLimit });
    } catch (error) {
      if (!(error instanceof WorkloadUnavailableError)) throw error;
      result = await generateTripSuggestions(tripInfo, candidates, language, parsed.data.preference, { allowExternal: false, limit: suggestionLimit });
    }
    const candidatesById = new Map(candidates.map((candidate) => [candidate.productId, candidate]));

    const groundedSuggestions = result.suggestions.flatMap((suggestion) => {
      const candidate = candidatesById.get(suggestion.productId);
      return candidate ? [{
        ...suggestion,
        outletId: candidate.outletId,
        lat: candidate.lat,
        lng: candidate.lng,
        price: candidate.price,
        rating: candidate.rating,
        image: candidate.image,
        category: candidate.category,
        categorySlug: candidate.categorySlug,
      }] : [];
    });
    const suggestions = intent.directAdd
      ? intent.groups.flatMap((group) => {
        const categoryCandidates = candidates.filter((candidate) => candidate.categorySlug === group.categorySlug);
        const selected = groundedSuggestions.filter((suggestion) => suggestion.categorySlug === group.categorySlug).slice(0, group.requestedCount);
        const selectedIds = new Set(selected.map((suggestion) => suggestion.productId));
        const fallback = ruleBasedTripSuggestions(categoryCandidates, undefined, language, group.requestedCount)
          .filter((suggestion) => !selectedIds.has(suggestion.productId))
          .map((suggestion) => {
            const candidate = candidatesById.get(suggestion.productId)!;
            return {
              ...suggestion,
              outletId: candidate.outletId,
              lat: candidate.lat,
              lng: candidate.lng,
              price: candidate.price,
              rating: candidate.rating,
              image: candidate.image,
              category: candidate.category,
              categorySlug: candidate.categorySlug,
            };
          });
        return [...selected, ...fallback].slice(0, group.requestedCount);
      })
      : groundedSuggestions;
    let batchOrder: string[] = [];
    let routeOrderSource: "matrix" | "approximate" = "approximate";
    if (intent.directAdd && intent.targetDate && suggestions.length > 0) {
      const todaysItems = tripItems.filter((item) => item.scheduled_date === intent.targetDate);
      const routeStops: RouteOrderStop[] = [
        ...todaysItems.map((item) => ({ id: `item:${item.id}`, lat: item.lat, lng: item.lng, scheduledTime: item.scheduled_time, isDayOrigin: item.is_day_origin, isExisting: true })),
        ...suggestions.map((item) => ({ id: `product:${item.productId}`, lat: item.lat, lng: item.lng })),
      ];
      const matrix = await getTravelMatrix(routeStops, user.id, parsed.data.travelMode, request.signal);
      const orderedDay = orderTripStops(routeStops, matrix);
      routeOrderSource = orderedDay.basis;
      const dayIds = new Set(todaysItems.map((item) => item.id));
      const firstDayPosition = tripItems.findIndex((item) => dayIds.has(item.id));
      const globalOrder = tripItems.filter((item) => !dayIds.has(item.id)).map((item) => `item:${item.id}`);
      const insertionIndex = firstDayPosition < 0 ? globalOrder.length : tripItems.slice(0, firstDayPosition).filter((item) => !dayIds.has(item.id)).length;
      globalOrder.splice(insertionIndex, 0, ...orderedDay.ids);
      batchOrder = globalOrder;
      const suggestionPosition = new Map(orderedDay.ids.map((id, index) => [id, index]));
      suggestions.sort((a, b) => (suggestionPosition.get(`product:${a.productId}`) ?? 0) - (suggestionPosition.get(`product:${b.productId}`) ?? 0));
    }

    return privateResponse(apiOk({
      mode: result.mode,
      scope,
      suggestions,
      directAdd: intent.directAdd,
      targetDate: intent.targetDate,
      requestedCount: intent.requestedCount,
      requestedTotal: intent.requestedTotal,
      requestedGroups: intent.groups,
      batchOrder,
      routeOrderSource,
    }));
  } catch {
    return privateResponse(apiFail("TRIP_PLAN_UNAVAILABLE", "Trip suggestions are temporarily unavailable", 500));
  }
}

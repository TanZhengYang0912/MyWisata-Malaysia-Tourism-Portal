import { z } from "zod";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import {
  customerCapabilityFailure,
  resolveServerCustomerCapability,
} from "@/lib/auth/customer-capabilities.server";
import { generateTripNameSuggestions } from "@/lib/customer/trip-name-suggestions.server";
import { tripDuration } from "@/lib/customer/trip-name";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { consumeTripNameSuggestionRateLimit } from "./route-state";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REQUEST_BYTES = 4_096;
const requestSchema = z.object({
  idea: z.string().trim().min(2).max(80),
  startDate: z.string().regex(ISO_DATE_PATTERN),
  endDate: z.string().regex(ISO_DATE_PATTERN),
  locale: z.enum(["en", "ms", "zh-CN"]),
}).strict();

function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function POST(request: Request) {
  try {
    const db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return privateResponse(apiFail("UNAUTHORIZED", "Sign in required", 401));

    const decision = await resolveServerCustomerCapability(user.id, CUSTOMER_CAPABILITY.BASIC_AI);
    const failure = customerCapabilityFailure(
      CUSTOMER_CAPABILITY.BASIC_AI,
      decision,
      "Phone verification is required before using AI trip naming",
    );
    if (failure) return privateResponse(failure);

    const parsed = await parseBody(request, requestSchema, { maxBytes: MAX_REQUEST_BYTES });
    if (!parsed.ok) return privateResponse(parsed.response);
    if (!consumeTripNameSuggestionRateLimit(user.id)) {
      return privateResponse(apiFail("RATE_LIMITED", "Too many naming requests. Please try again shortly.", 429));
    }

    let duration;
    try {
      duration = tripDuration(parsed.data.startDate, parsed.data.endDate);
    } catch {
      return privateResponse(apiFail("VALIDATION_FAILED", "Trip date range is invalid", 422));
    }

    const result = await generateTripNameSuggestions({
      idea: parsed.data.idea,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      duration,
      locale: parsed.data.locale,
    });
    return privateResponse(apiOk({ ...result, duration }));
  } catch {
    return privateResponse(apiFail("TRIP_NAME_SUGGESTIONS_UNAVAILABLE", "Trip name suggestions are temporarily unavailable", 500));
  }
}

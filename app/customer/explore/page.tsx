import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCachedComputedActivities } from "@/lib/cache/catalogue-cache";
import { getStatesWithPlaces } from "@/backend/domains/places";
import { ExploreClient } from "./explore-client";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";

export const metadata: Metadata = {
  title: `Explore Malaysia — ${BRAND_NAME}`,
  description: "Discover destinations by state or filter experiences by category across Malaysia.",
};

function isTransientSupabaseError(error: unknown, responseStatus?: unknown): boolean {
  if (error instanceof TypeError && /fetch/i.test(error.message)) return true;
  if (!error || typeof error !== "object") return false;

  const details = error as { status?: unknown; code?: unknown; message?: unknown };
  const status = typeof responseStatus === "number" ? responseStatus : details.status;
  if (typeof status === "number" && (status === 408 || status === 429 || status >= 500)) return true;

  // PostgREST returns status 0 fetch failures as an error message and drops the
  // HTTP status from parsed non-JSON upstream responses such as Cloudflare 522.
  if (typeof details.code === "string" && details.code.trim()) return false;
  if (typeof details.message !== "string") return false;

  return /^(?:TypeError|FetchError):\s/i.test(details.message)
    || /<title\b[^>]*>[^<]*\b(?:408|429|5\d{2})\b/i.test(details.message);
}

async function loadWithTransientFallback<T>(load: () => Promise<T>, fallback: T) {
  try {
    return { value: await load(), unavailable: false };
  } catch (error) {
    if (!isTransientSupabaseError(error)) throw error;
    return { value: fallback, unavailable: true };
  }
}

export default async function ExplorePage() {
  const db = await createClient();
  const [activityLoad, stateLoad] = await Promise.all([
    loadWithTransientFallback(() => getCachedComputedActivities(), []),
    loadWithTransientFallback(() => getStatesWithPlaces(db), []),
  ]);

  return (
    <ExploreClient
      initialActivities={activityLoad.value}
      statesWithPlaces={stateLoad.value}
      dataUnavailable={activityLoad.unavailable || stateLoad.unavailable}
    />
  );
}

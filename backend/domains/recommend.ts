// §11.2 recommendation feed — loads preferences + signals and ranks candidates
// via the pure scorer in recommend-score.ts. Runs server-side (RSC / route).
//
// ponytail: O(n) in-memory scan over all active activities — same fetch path as
// searchActivities. Fine at seed scale; move to a match_listings SQL RPC with a
// (lat,lng) index when the catalogue outgrows a single fetch.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/backend/supabase";
import type { ComputedActivity } from "@/backend/core/types";
import { searchActivities } from "@/backend/domains/catalogue";
import { canonicalCategorySlug, normalizeCategorySlugs } from "@/lib/customer/discovery-categories";
import {
  passesHardFilters, scoreActivity, REASON_LABELS,
  type UserPrefs, type ScoreContext, type ReasonTag,
} from "@/backend/domains/recommend-score";

export interface FeedItem {
  activity: ComputedActivity;
  reason: ReasonTag | null;   // null = cold-start / no personalisation
  reasonLabel: string | null;
}

type PrefRow = {
  interests: string[] | null;
  budget_range: string | null;
  mobility_needs: string | null;
  pet_friendly: boolean | null;
  preferred_radius_km: number | null;
  learned_affinity: Record<string, number> | null;
};

function toPrefs(row: PrefRow): UserPrefs {
  const budget = (["budget", "mid_range", "luxury"].includes(row.budget_range ?? "") ? row.budget_range : "mid_range") as UserPrefs["budgetRange"];
  const mobility = (["none", "limited", "wheelchair"].includes(row.mobility_needs ?? "") ? row.mobility_needs : "none") as UserPrefs["mobilityNeeds"];
  return {
    interests: normalizeCategorySlugs(row.interests),
    budgetRange: budget,
    mobilityNeeds: mobility,
    petFriendly: Boolean(row.pet_friendly),
    preferredRadiusKm: row.preferred_radius_km ?? 20,
    learnedAffinity: Object.entries(row.learned_affinity ?? {}).reduce<Record<string, number>>((acc, [slug, score]) => {
      const canonical = canonicalCategorySlug(slug);
      if (canonical) acc[canonical] = (acc[canonical] ?? 0) + Number(score);
      return acc;
    }, {}),
  };
}

export interface FeedOptions {
  near?: { lat: number; lng: number };
  limit?: number;
}

/**
 * Personalised feed for a user. Cold start (§11.4): a user with no preference
 * row gets a trending + location fallback with no match-reason tags.
 */
export async function getRecommendedFeed(
  userId: string | null,
  opts: FeedOptions = {},
  db: SupabaseClient = supabase,
): Promise<FeedItem[]> {
  const limit = opts.limit ?? 12;
  const candidates = await searchActivities({ near: opts.near, sort: "recommended" }, db);

  if (!userId) return coldStart(candidates, limit);

  const { data: prefRow } = await db
    .from("preference_survey_responses")
    .select("interests,budget_range,mobility_needs,pet_friendly,preferred_radius_km,learned_affinity")
    .eq("user_id", userId)
    .maybeSingle();

  if (!prefRow) return coldStart(candidates, limit);
  const prefs = toPrefs(prefRow as PrefRow);

  // Collaborative scores (§11.2.2) via the anonymised RPC.
  const collaborative: Record<string, number> = {};
  const { data: collabRows } = await db.rpc("collaborative_recommendations", { p_user_id: userId, p_limit: 40 });
  for (const r of (collabRows ?? []) as { product_id: string; score: number }[]) collaborative[r.product_id] = Number(r.score);
  const maxCollaborative = Math.max(0, ...Object.values(collaborative));

  const ctx: ScoreContext = { now: new Date(), collaborative, content: {}, maxCollaborative };

  const scored = candidates
    .filter((a) => passesHardFilters(a, prefs))
    .map((a) => scoreActivity(a, prefs, ctx))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);

  return scored.map((s) => ({ activity: s.activity, reason: s.reason, reasonLabel: REASON_LABELS[s.reason] }));
}

function coldStart(candidates: ComputedActivity[], limit: number): FeedItem[] {
  // searchActivities already sorts "recommended" by popularity; keep that order.
  return candidates.slice(0, limit).map((activity) => ({ activity, reason: null, reasonLabel: null }));
}

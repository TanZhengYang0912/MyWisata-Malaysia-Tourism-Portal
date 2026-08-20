// §11.2 ranking — pure scoring, no I/O (so it's unit-testable). The async
// orchestration that loads preferences/interactions and sorts lives in
// backend/domains/recommend.ts. All tunables sit in WEIGHTS / BUDGET_CEILINGS —
// ponytail: those are the calibration knobs, adjust them, don't rewrite the fn.

import type { ComputedActivity } from "@/backend/core/types";

export type ReasonTag = "near_you" | "interests" | "similar" | "hidden_gem";

export interface UserPrefs {
  interests: string[];        // category slugs
  budgetRange: "budget" | "mid_range" | "luxury";
  mobilityNeeds: "none" | "limited" | "wheelchair";
  petFriendly: boolean;
  preferredRadiusKm: number;  // 0 = any distance
  learnedAffinity: Record<string, number>; // slug -> accumulated weight
}

export interface ScoreContext {
  now: Date;
  collaborative: Record<string, number>; // productId -> co-occurrence count
  content: Record<string, number>;        // productId -> cosine similarity 0..1
  maxCollaborative: number;               // for normalisation (0 = none)
}

// Per-activity price ceilings for the budget hard filter (RM). Calibration knob.
const BUDGET_CEILINGS: Record<UserPrefs["budgetRange"], number> = {
  budget: 50,
  mid_range: 200,
  luxury: Infinity,
};

export function budgetCeiling(band: UserPrefs["budgetRange"]): number {
  return BUDGET_CEILINGS[band] ?? Infinity;
}

// §11.2.1 hard filters — budget, distance, availability. NOT accessibility:
// per decision 3 we badge/boost accessible listings but never hide unknowns.
export function passesHardFilters(a: ComputedActivity, prefs: UserPrefs): boolean {
  if (a.price > budgetCeiling(prefs.budgetRange)) return false;
  if (prefs.preferredRadiusKm > 0 && a.distanceKm !== undefined && a.distanceKm > prefs.preferredRadiusKm) return false;
  return true;
}

const WEIGHTS = {
  interest: 40,   // declared interest match
  learned: 20,    // activity-learned affinity for the category
  location: 25,   // proximity (closer = more)
  rating: 15,     // review quality
  recency: 12,    // newly added
  time: 10,       // time-of-day fit
  access: 8,      // explicit accessibility advantage
  collaborative: 22,
  content: 18,
};

// Time-of-day category boosts (§11.2.6). Hour ranges are local.
function timeBoost(slug: string | undefined, hour: number): number {
  const isMeal = (hour >= 11 && hour <= 14) || (hour >= 18 && hour <= 21);
  const isAfternoon = hour >= 12 && hour <= 17;
  const isEvening = hour >= 19 || hour <= 1;
  if (slug === "food" && isMeal) return 1;
  if ((slug === "nature" || slug === "adventure") && isAfternoon) return 1;
  if (slug === "nightlife" && isEvening) return 1;
  return 0;
}

// Age decay: 1.0 for brand-new, →0 over ~180 days.
function recencyBoost(createdAt: string | undefined, now: Date): number {
  if (!createdAt) return 0;
  const days = (now.getTime() - new Date(createdAt).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return 0;
  return Math.max(0, 1 - days / 180);
}

export interface ScoredActivity {
  activity: ComputedActivity;
  score: number;
  reason: ReasonTag;
}

export function scoreActivity(a: ComputedActivity, prefs: UserPrefs, ctx: ScoreContext): ScoredActivity {
  const slug = a.categorySlug;
  const contrib: Record<ReasonTag, number> = { near_you: 0, interests: 0, similar: 0, hidden_gem: 0 };

  // Interest + learned affinity → "Matches your interests"
  if (slug && prefs.interests.includes(slug)) contrib.interests += WEIGHTS.interest;
  if (slug && prefs.learnedAffinity[slug]) {
    const maxAff = Math.max(1, ...Object.values(prefs.learnedAffinity));
    contrib.interests += WEIGHTS.learned * (prefs.learnedAffinity[slug] / maxAff);
  }

  // Location → "Near you"
  if (a.distanceKm !== undefined) {
    const radius = prefs.preferredRadiusKm > 0 ? prefs.preferredRadiusKm : 20;
    contrib.near_you += WEIGHTS.location * Math.max(0, 1 - a.distanceKm / radius);
  }

  // Collaborative → "Popular with similar travellers"
  if (ctx.maxCollaborative > 0 && ctx.collaborative[a.id]) {
    contrib.similar += WEIGHTS.collaborative * (ctx.collaborative[a.id] / ctx.maxCollaborative);
  }

  // Recency + quality-but-obscure → "Hidden Gem"
  const recency = recencyBoost(a.createdAt, ctx.now);
  contrib.hidden_gem += WEIGHTS.recency * recency;
  if (a.rating >= 4.5 && a.reviews > 0 && a.reviews <= 5) contrib.hidden_gem += WEIGHTS.recency;

  // Flat contributors that don't drive a reason tag on their own.
  const rating = WEIGHTS.rating * (a.rating / 5) * (a.reviews > 0 ? 1 : 0.4);
  const time = WEIGHTS.time * timeBoost(slug, ctx.now.getHours());
  const access =
    (prefs.mobilityNeeds !== "none" && a.outlet.wheelchairAccessible === true ? WEIGHTS.access : 0) +
    (prefs.petFriendly && a.outlet.petFriendly === true ? WEIGHTS.access / 2 : 0);
  const content = WEIGHTS.content * (ctx.content[a.id] ?? 0);

  const score = contrib.near_you + contrib.interests + contrib.similar + contrib.hidden_gem + rating + time + access + content;

  // Dominant reason = the tag with the largest contribution (interests wins ties).
  const reason = (Object.keys(contrib) as ReasonTag[]).reduce((best, k) =>
    contrib[k] > contrib[best] ? k : best, "interests");

  return { activity: a, score, reason };
}

export const REASON_LABELS: Record<ReasonTag, string> = {
  near_you: "Near you",
  interests: "Matches your interests",
  similar: "Popular with similar travellers",
  hidden_gem: "Hidden Gem",
};

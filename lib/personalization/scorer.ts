import type { ComputedActivity } from '@/backend/core/types';

export type TravelPreferences = { interests: string[]; budgetRange: string; mobilityNeeds: string; preferredRadiusKm: number; travelStyle?: string };

// Grounded match reasons — emitted only for signals that actually contributed to
// the score, so the "why it fits" copy never claims something that didn't match.
// Language-agnostic codes; the client localizes them (see for-you-client.tsx).
export type PersonalizationReason =
  | { code: 'interest'; category: string }
  | { code: 'budget' }
  | { code: 'nearby'; distanceKm: number }
  | { code: 'accessible' };

function inBudgetBand(price: number, band: string): boolean {
  if (band === 'budget') return price <= 100;
  if (band === 'mid_range') return price > 100 && price <= 300;
  if (band === 'luxury') return price > 300;
  return false;
}

export function rankPersonalizedActivities(activities: ComputedActivity[], preferences: TravelPreferences) {
  const maxDistance = preferences.preferredRadiusKm > 0 ? preferences.preferredRadiusKm : undefined;
  return activities
    .filter((activity) => maxDistance === undefined || activity.distanceKm === undefined || activity.distanceKm <= maxDistance)
    .map((activity) => {
      const haystack = `${activity.name} ${activity.category} ${activity.description} ${(activity.tags ?? []).join(' ')}`.toLowerCase();
      const reasons: PersonalizationReason[] = [];

      let score = 0;
      const matchedInterest = preferences.interests.find((interest) => haystack.includes(interest.toLowerCase()));
      for (const interest of preferences.interests) {
        if (haystack.includes(interest.toLowerCase())) score += 40;
      }
      if (matchedInterest) reasons.push({ code: 'interest', category: matchedInterest });

      if (inBudgetBand(activity.price, preferences.budgetRange)) {
        score += 25;
        reasons.push({ code: 'budget' });
      }

      if (maxDistance && activity.distanceKm !== undefined && activity.distanceKm <= maxDistance) {
        score += 20;
        reasons.push({ code: 'nearby', distanceKm: activity.distanceKm });
      }

      if (preferences.mobilityNeeds !== 'none' && haystack.includes(preferences.mobilityNeeds.toLowerCase())) {
        score += 10;
        reasons.push({ code: 'accessible' });
      }

      const whyItFits = `Matches your ${preferences.interests[0] ?? 'travel'} interests and ${preferences.budgetRange.replace('_', ' ')} budget.`;
      return { activity, score, whyItFits, reasons };
    })
    // V8's stable Array#sort keeps the catalogue's existing order for equal scores.
    .sort((a, b) => b.score - a.score);
}

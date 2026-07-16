import type { ComputedActivity } from '@/backend/core/types';

export type TravelPreferences = { interests: string[]; budgetRange: string; mobilityNeeds: string; preferredDistance: string };

const DISTANCE_KM: Record<string, number | undefined> = { walking: 1, nearby: 5, travel: 20 };

export function rankPersonalizedActivities(activities: ComputedActivity[], preferences: TravelPreferences) {
  const maxDistance = DISTANCE_KM[preferences.preferredDistance];
  return activities
    .filter((activity) => maxDistance === undefined || activity.distanceKm === undefined || activity.distanceKm <= maxDistance)
    .map((activity) => {
      const haystack = `${activity.name} ${activity.category} ${activity.description} ${(activity.tags ?? []).join(' ')}`.toLowerCase();
      let score = preferences.interests.reduce((total, interest) => total + (haystack.includes(interest.toLowerCase()) ? 40 : 0), 0);
      if ((preferences.budgetRange === 'budget' && activity.price <= 100) || (preferences.budgetRange === 'mid_range' && activity.price > 100 && activity.price <= 300) || (preferences.budgetRange === 'luxury' && activity.price > 300)) score += 25;
      if (maxDistance && activity.distanceKm !== undefined && activity.distanceKm <= maxDistance) score += 20;
      if (preferences.mobilityNeeds !== 'none' && haystack.includes(preferences.mobilityNeeds.toLowerCase())) score += 10;
      return { activity, score, whyItFits: `Matches your ${preferences.interests[0] ?? 'travel'} interests and ${preferences.budgetRange.replace('_', ' ')} budget.` };
    })
    // V8's stable Array#sort keeps the catalogue's existing order for equal scores.
    .sort((a, b) => b.score - a.score);
}

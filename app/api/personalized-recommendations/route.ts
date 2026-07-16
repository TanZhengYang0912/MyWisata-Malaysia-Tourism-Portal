import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { searchActivities } from '@/backend/domains/catalogue';
import { cityCentre, parseRecommendationCoordinates } from '@/lib/personalization/location';
import { describeFit } from '@/lib/personalization/explanation';
import { rankPersonalizedActivities, type TravelPreferences } from '@/lib/personalization/scorer';

const PERSONALIZED_TIERS = new Set(['profile_complete', 'kyc_verified']);
const PHONE_READY_TIERS = new Set(['phone_verified', 'profile_complete', 'kyc_verified']);

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const body = await request.json().catch(() => null);
  const browserOrigin = parseRecommendationCoordinates(body);
  if (body !== null && body !== undefined && !browserOrigin && ('latitude' in (body as object) || 'longitude' in (body as object))) {
    return apiFail('VALIDATION_FAILED', 'Location coordinates are invalid', 422);
  }

  const [{ data: profile, error: profileError }, { data: survey, error: surveyError }] = await Promise.all([
    db.from('users').select('tier,city').eq('id', user.id).maybeSingle(),
    db.from('preference_survey_responses').select('interests,budget_range,mobility_needs,preferred_distance').eq('user_id', user.id).maybeSingle(),
  ]);
  if (profileError || !profile) return apiFail('PROFILE_UNAVAILABLE', 'Unable to read your verification status', 500);
  if (!PHONE_READY_TIERS.has(profile.tier)) return apiFail('PHONE_VERIFICATION_REQUIRED', 'Phone verification is required before using recommendations', 403);
  if (surveyError) return apiFail('PREFERENCES_UNAVAILABLE', 'Unable to read preferences', 500);

  const cityOrigin = await cityCentre(profile.city);
  const origin = browserOrigin ?? cityOrigin ?? undefined;
  const activities = await searchActivities({ category: null, sort: 'recommended', near: origin }, db);
  const personalized = PERSONALIZED_TIERS.has(profile.tier) && Boolean(survey);

  if (!personalized) {
    return apiOk({
      mode: 'generic' as const,
      locationSource: browserOrigin ? 'browser' : cityOrigin ? 'city' : 'none',
      activities: activities.slice(0, 6).map((activity) => ({ activity })),
    });
  }

  const preferences: TravelPreferences = {
    interests: survey?.interests ?? [],
    budgetRange: survey?.budget_range ?? 'mid_range',
    mobilityNeeds: survey?.mobility_needs ?? 'none',
    preferredDistance: survey?.preferred_distance ?? 'no_preference',
  };
  const ranked = rankPersonalizedActivities(activities, preferences).slice(0, 6);
  const cards = await Promise.all(ranked.map(async ({ activity, score, whyItFits }) => ({
    activity,
    score,
    whyItFits: await describeFit({ preferences, activity }),
    fallbackWhyItFits: whyItFits,
  })));
  return apiOk({
    mode: 'personalized' as const,
    locationSource: browserOrigin ? 'browser' : cityOrigin ? 'city' : 'none',
    activities: cards,
  });
}

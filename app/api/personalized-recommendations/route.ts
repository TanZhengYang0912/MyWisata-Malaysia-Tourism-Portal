import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { searchActivities } from '@/backend/domains/catalogue';
import { cityCentre, parseRecommendationCoordinates } from '@/lib/personalization/location';
import { describeFit } from '@/lib/personalization/explanation';
import { rankPersonalizedActivities, type TravelPreferences } from '@/lib/personalization/scorer';
import { normalizeCategorySlugs } from '@/lib/customer/discovery-categories';
import { CUSTOMER_CAPABILITY, resolveCustomerCapability } from '@/lib/auth/customer-capabilities';
import { customerCapabilityFailure, resolveServerCustomerCapability } from '@/lib/auth/customer-capabilities.server';
import { computeProfileVerification } from '@/lib/verification/eligibility';

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return customerCapabilityFailure(
    CUSTOMER_CAPABILITY.BASIC_AI,
    resolveCustomerCapability(null, CUSTOMER_CAPABILITY.BASIC_AI),
    'Sign in before generating recommendations',
  )!;

  const aiDecision = await resolveServerCustomerCapability(user.id, CUSTOMER_CAPABILITY.BASIC_AI);
  const aiFailure = customerCapabilityFailure(
    CUSTOMER_CAPABILITY.BASIC_AI,
    aiDecision,
    'Phone verification is required before using recommendations',
  );
  if (aiFailure) return aiFailure;

  const body = await request.json().catch(() => null);
  const browserOrigin = parseRecommendationCoordinates(body);
  if (body !== null && body !== undefined && !browserOrigin && ('latitude' in (body as object) || 'longitude' in (body as object))) {
    return apiFail('VALIDATION_FAILED', 'Location coordinates are invalid', 422);
  }

  const [{ data: profile, error: profileError }, { data: survey, error: surveyError }] = await Promise.all([
    db.from('users').select('profile_completed_at,kyc_status,full_name,avatar_url,bio,city,country').eq('id', user.id).maybeSingle(),
    db.from('preference_survey_responses').select('interests,budget_range,mobility_needs,preferred_radius_km').eq('user_id', user.id).maybeSingle(),
  ]);
  if (profileError || !profile) return apiFail('PROFILE_UNAVAILABLE', 'Unable to read your verification status', 500);
  if (surveyError) return apiFail('PREFERENCES_UNAVAILABLE', 'Unable to read preferences', 500);

  const cityOrigin = await cityCentre(profile.city);
  const origin = browserOrigin ?? cityOrigin ?? undefined;
  const activities = await searchActivities({ category: null, sort: 'recommended', near: origin }, db);
  const profileVerification = computeProfileVerification({
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    city: profile.city,
    country: profile.country,
    surveyComplete: Boolean(survey?.interests?.length),
  });
  const profileComplete = Boolean(profile.profile_completed_at) && profileVerification.complete;
  const personalized = Boolean(profileComplete || profile.kyc_status === 'approved') && Boolean(survey);

  if (!personalized) {
    return apiOk({
      mode: 'generic' as const,
      locationSource: browserOrigin ? 'browser' : cityOrigin ? 'city' : 'none',
      activities: activities.slice(0, 6).map((activity) => ({ activity })),
    });
  }

  const preferences: TravelPreferences = {
    interests: normalizeCategorySlugs(survey?.interests),
    budgetRange: survey?.budget_range ?? 'mid_range',
    mobilityNeeds: survey?.mobility_needs ?? 'none',
    preferredRadiusKm: survey?.preferred_radius_km ?? 20,
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

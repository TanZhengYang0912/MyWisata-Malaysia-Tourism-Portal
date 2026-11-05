import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { preferenceSurveySchema } from '@/lib/validation/profile-schemas';
import { normalizeCategorySlugs } from '@/lib/customer/discovery-categories';

// POST: save personalization answers without changing verification tier.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, preferenceSurveySchema);
  if (!parsed.ok) return parsed.response;
  const { interests, travelStyle, budgetRange, mobilityNeeds, petFriendly, preferredRadiusKm, notes } = parsed.data;

  const { data: current, error: readError } = await supabase.from('preference_survey_responses')
    .select('interests,travel_style,budget_range,mobility_needs,pet_friendly,preferred_radius_km,notes')
    .eq('user_id', user.id).maybeSingle();
  if (readError) return apiFail('SURVEY_SAVE_FAILED', 'Unable to save preferences. Try again.', 503);
  const normalizedInterests = normalizeCategorySlugs(interests);
  const unchanged = current !== null
    && JSON.stringify(normalizeCategorySlugs(current.interests)) === JSON.stringify(normalizedInterests)
    && current.travel_style === travelStyle && current.budget_range === budgetRange
    && current.mobility_needs === mobilityNeeds && current.pet_friendly === petFriendly
    && current.preferred_radius_km === preferredRadiusKm && current.notes === (notes ?? null);
  if (unchanged) return apiOk({ submitted: true, changed: false }, { status: 201 });

  const { error } = await supabase.rpc('complete_preference_survey', {
    p_user_id:             user.id,
    p_interests:           normalizedInterests,
    p_travel_style:        travelStyle,
    p_budget_range:        budgetRange,
    p_mobility_needs:      mobilityNeeds,
    p_pet_friendly:        petFriendly,
    p_preferred_radius_km: preferredRadiusKm,
    p_notes:               notes ?? null,
  });

  if (error) {
    console.error('[profile/survey] survey submit failed', error);
    return apiFail('SURVEY_SAVE_FAILED', 'Unable to save preferences. Try again.', 500);
  }

  return apiOk({ submitted: true, changed: true }, { status: 201 });
}

// PUT: update preferences (no tier effect — survey already counted)
export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, preferenceSurveySchema);
  if (!parsed.ok) return parsed.response;
  const { interests, travelStyle, budgetRange, mobilityNeeds, petFriendly, preferredRadiusKm, notes } = parsed.data;

  const { data, error } = await supabase.rpc('save_preference_survey_if_changed', {
    p_interests: normalizeCategorySlugs(interests), p_travel_style: travelStyle,
    p_budget_range: budgetRange, p_mobility_needs: mobilityNeeds, p_pet_friendly: petFriendly,
    p_preferred_radius_km: preferredRadiusKm, p_notes: notes ?? null,
  });

  if (error) {
    console.error('[profile/survey] survey update failed', error);
    return apiFail('SURVEY_SAVE_FAILED', 'Unable to save preferences. Try again.', 500);
  }

  return apiOk({ updated: true, changed: data === true });
}

// GET: fetch current survey answers
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data, error } = await supabase
    .from('preference_survey_responses')
    .select('interests, travel_style, budget_range, mobility_needs, pet_friendly, preferred_radius_km, notes, learned_affinity, created_at, updated_at')
    .eq('user_id', user.id)
    .single();

  if (error && error.code === 'PGRST116') return apiOk(null);
  if (error) {
    console.error('[profile/survey] survey load failed', error);
    return apiFail('SURVEY_LOAD_FAILED', 'Unable to load preferences. Try again.', 500);
  }

  return apiOk(data ? { ...data, interests: normalizeCategorySlugs(data.interests) } : data);
}

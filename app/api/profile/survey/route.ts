import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { preferenceSurveySchema } from '@/lib/validation/profile-schemas';

// POST: submit survey (promotes tier if all profile criteria met)
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, preferenceSurveySchema);
  if (!parsed.ok) return parsed.response;
  const { interests, travelStyle, budgetRange, mobilityNeeds, groupComposition, petFriendly, preferredRadiusKm, notes } = parsed.data;

  const { error } = await supabase.rpc('complete_preference_survey', {
    p_user_id:             user.id,
    p_interests:           interests,
    p_travel_style:        travelStyle,
    p_budget_range:        budgetRange,
    p_mobility_needs:      mobilityNeeds,
    p_group_composition:   groupComposition,
    p_pet_friendly:        petFriendly,
    p_preferred_radius_km: preferredRadiusKm,
    p_notes:               notes ?? null,
  });

  if (error) return apiFail('DB_ERROR', error.message, 500);

  const { data: profile } = await supabase
    .from('users')
    .select('tier')
    .eq('id', user.id)
    .single();

  return apiOk({ submitted: true, tier: profile?.tier ?? null }, { status: 201 });
}

// PUT: update preferences (no tier effect — survey already counted)
export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, preferenceSurveySchema);
  if (!parsed.ok) return parsed.response;
  const { interests, travelStyle, budgetRange, mobilityNeeds, groupComposition, petFriendly, preferredRadiusKm, notes } = parsed.data;

  const { error } = await supabase
    .from('preference_survey_responses')
    .update({
      interests,
      travel_style:        travelStyle,
      budget_range:        budgetRange,
      mobility_needs:      mobilityNeeds,
      group_composition:   groupComposition,
      pet_friendly:        petFriendly,
      preferred_radius_km: preferredRadiusKm,
      notes:               notes ?? null,
      updated_at:          new Date().toISOString(),
    })
    .eq('user_id', user.id);

  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk({ updated: true });
}

// GET: fetch current survey answers
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data, error } = await supabase
    .from('preference_survey_responses')
    .select('interests, travel_style, budget_range, mobility_needs, group_composition, pet_friendly, preferred_radius_km, notes, learned_affinity, created_at, updated_at')
    .eq('user_id', user.id)
    .single();

  if (error && error.code === 'PGRST116') return apiOk(null);
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk(data);
}

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { identitySchema } from '@/lib/validation/profile-schemas';
import { getCanonicalCountryName } from '@/lib/location/countries';
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, identitySchema);
  if (!parsed.ok) return parsed.response;
  const { fullName, city, country, cityId, countryCode } = parsed.data;

  let resolvedCity = city;
  let resolvedCountry = country;
  let resolvedCityId: string | null = null;
  let citySource: 'manual' | 'catalogue' = 'manual';

  if (countryCode) resolvedCountry = getCanonicalCountryName(countryCode);

  if (cityId && countryCode) {
    const { data: selectedCities, error: cityError } = await supabase.rpc('resolve_profile_location_city', {
      p_city_id: cityId,
      p_country_code: countryCode,
    });
    const selectedCity = selectedCities?.[0];
    if (cityError) return apiFail('DB_ERROR', 'Unable to validate city', 500);
    if (!selectedCity) return apiFail('INVALID_LOCATION', 'Selected city does not match the country', 422);
    resolvedCity = selectedCity.name;
    resolvedCountry = getCanonicalCountryName(selectedCity.country_code);
    resolvedCityId = selectedCity.id;
    citySource = 'catalogue';
  }

  const { data: saveRows, error } = await supabase.rpc('save_profile_identity_if_changed', {
    p_full_name: fullName, p_city: resolvedCity, p_country: resolvedCountry, p_city_id: resolvedCityId,
    p_country_code: countryCode ?? null, p_city_source: citySource,
  });
  if (error) return apiFail('DB_ERROR', 'Unable to update profile identity', 500);
  const saved = Array.isArray(saveRows) ? saveRows[0] : null;
  if (!saved) return apiFail('DB_ERROR', 'Unable to update profile identity', 500);
  const changed = saved.changed === true;

  // Only a real identity change can alter profile-completion eligibility.
  const { error: promoteErr } = changed ? await supabase.rpc('promote_to_profile_complete', {
    p_user_id: user.id,
  }) : { error: null };

  // Promotion errors are non-fatal: other fields may not be complete yet
  const promoted = !promoteErr;

  return apiOk({ updated: true, changed, tier: saved.tier ?? null, promoted });
}

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

  // Write identity fields
  const { error } = await supabase
    .from('users')
    .update({
      full_name: fullName,
      city: resolvedCity,
      country: resolvedCountry,
      city_id: resolvedCityId,
      country_code: countryCode ?? null,
      city_source: citySource,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) return apiFail('DB_ERROR', 'Unable to update profile identity', 500);

  // Attempt tier promotion — RPC checks all fields atomically
  const { error: promoteErr } = await supabase.rpc('promote_to_profile_complete', {
    p_user_id: user.id,
  });

  // Promotion errors are non-fatal: other fields may not be complete yet
  const promoted = !promoteErr;

  const { data: profile } = await supabase
    .from('users')
    .select('tier')
    .eq('id', user.id)
    .single();

  return apiOk({ updated: true, tier: profile?.tier ?? null, promoted });
}

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { identitySchema } from '@/lib/validation/profile-schemas';
import { findCountryCode } from '@/lib/location/countries';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, identitySchema);
  if (!parsed.ok) return parsed.response;

  if (parsed.data.cityId !== undefined || parsed.data.countryCode !== undefined) {
    return apiFail('USE_PROFILE_IDENTITY', 'Canonical location updates must use /api/profile/identity', 422);
  }

  const { fullName, city, country } = parsed.data;

  const countryCode = findCountryCode(country, 'en');
  const { data: saveRows, error } = await supabase.rpc('save_profile_identity_if_changed', {
    p_full_name: fullName,
    p_city: city,
    p_country: country,
    p_city_id: null,
    p_country_code: countryCode,
    p_city_source: 'manual',
  });
  if (error) return apiFail('DB_ERROR', 'Unable to update profile', 500);
  const updated = Array.isArray(saveRows) ? saveRows[0] : null;
  if (!updated) return apiFail('DB_ERROR', 'Unable to update profile', 500);

  return apiOk({ verificationTier: updated.tier ?? 'email_unverified', changed: updated.changed === true });
}

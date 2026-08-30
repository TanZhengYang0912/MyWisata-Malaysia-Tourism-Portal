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

  const { error } = await supabase
    .from('users')
    .update({
      full_name: fullName,
      city,
      country,
      city_id: null,
      country_code: findCountryCode(country, 'en'),
      city_source: 'manual',
    })
    .eq('id', user.id);

  if (error) return apiFail('DB_ERROR', 'Unable to update profile', 500);

  const { data: updated } = await supabase
    .from('users')
    .select('tier')
    .eq('id', user.id)
    .single();

  return apiOk({ verificationTier: updated?.tier ?? 'email_unverified' });
}

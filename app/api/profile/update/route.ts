import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { identitySchema } from '@/lib/validation/profile-schemas';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, identitySchema);
  if (!parsed.ok) return parsed.response;

  const { fullName, city, country } = parsed.data;

  const { error } = await supabase
    .from('users')
    .update({ full_name: fullName, city, country })
    .eq('id', user.id);

  if (error) return apiFail('DB_ERROR', error.message, 500);

  const { data: updated } = await supabase
    .from('users')
    .select('tier')
    .eq('id', user.id)
    .single();

  return apiOk({ verificationTier: updated?.tier ?? 'email_unverified' });
}

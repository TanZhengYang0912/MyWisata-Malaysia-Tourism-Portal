import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { identitySchema } from '@/lib/validation/profile-schemas';
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, identitySchema);
  if (!parsed.ok) return parsed.response;
  const { fullName, city, country } = parsed.data;

  // Write identity fields
  const { error } = await supabase
    .from('users')
    .update({ full_name: fullName, city, country, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) return apiFail('DB_ERROR', error.message, 500);

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

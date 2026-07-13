import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { avatarConfirmSchema } from '@/lib/validation/profile-schemas';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, avatarConfirmSchema);
  if (!parsed.ok) return parsed.response;
  const { path } = parsed.data;

  // Verify path belongs to this user (must start with user.id/)
  if (!path.startsWith(`${user.id}/`)) {
    return apiFail('FORBIDDEN', 'Path does not belong to your account', 403);
  }

  // Confirm object exists in storage before writing to profile
  const { data: obj, error: objErr } = await supabase.storage
    .from('avatars')
    .list(user.id, { search: path.split('/').pop() });

  if (objErr || !obj?.length) {
    return apiFail('NOT_FOUND', 'Upload not found — complete the upload before confirming', 404);
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

  // Write avatar_url to profile
  const { error } = await supabase
    .from('users')
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) return apiFail('DB_ERROR', error.message, 500);

  // Attempt tier promotion (non-fatal — other fields may still be missing)
  await supabase.rpc('promote_to_profile_complete', { p_user_id: user.id });

  const { data: profile } = await supabase.from('users').select('tier').eq('id', user.id).single();

  return apiOk({ confirmed: true, avatarUrl: publicUrl, tier: profile?.tier ?? null });
}

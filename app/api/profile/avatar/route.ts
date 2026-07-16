import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';

const SIGNED_URL_TTL_SECONDS = 60;

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // Read an extension hint only; confirm route validates the actual bytes.
  const url = new URL(request.url);
  const mime = url.searchParams.get('type') ?? 'image/jpeg';
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(mime)) {
    return apiFail('INVALID_TYPE', 'Allowed types: image/jpeg, image/png, image/webp', 422);
  }

  const ext = mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg';
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from('avatars')
    .createSignedUploadUrl(path, { upsert: true });

  if (error) return apiFail('STORAGE_ERROR', error.message, 500);

  return apiOk({
    uploadUrl: data.signedUrl,
    path,
    token:     data.token,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });
}

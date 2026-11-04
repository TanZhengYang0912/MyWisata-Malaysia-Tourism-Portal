import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { readBoundedFormData, RequestBodyError } from '@/lib/validation/request-body';
import { AVATAR_MAX_BYTES, validateAvatarBytes, validateAvatarFileMetadata } from '@/lib/profile/avatar-validation';

const privateResponse = (response: Response) => {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
};
const extension = (type: string) => type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : null;

function sameAccountLegacyAvatarPath(value: string | null, ownerId: string): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value || !supabaseUrl) return null;
  try {
    const base = new URL(supabaseUrl);
    const avatar = new URL(value);
    const prefix = `${base.pathname.replace(/\/$/, '')}/storage/v1/object/public/avatars/`;
    if (avatar.origin !== base.origin || !avatar.pathname.startsWith(prefix) || avatar.search || avatar.hash) return null;
    const encodedPath = avatar.pathname.slice(prefix.length);
    const path = encodedPath.split('/').map((part) => decodeURIComponent(part)).join('/');
    const segments = path.split('/');
    if (segments[0] !== ownerId || segments.length < 2 || segments.some((part) => !part || part === '.' || part === '..' || !/^[A-Za-z0-9._-]+$/.test(part))) return null;
    return path;
  } catch {
    return null;
  }
}

/** Accept bytes at the server boundary so the digest and reusable asset are trusted. */
export async function POST(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user || user.is_anonymous) return privateResponse(apiFail('UNAUTHORIZED', 'Sign in required', 401));

  let form: FormData;
  try { form = await readBoundedFormData(request, AVATAR_MAX_BYTES + 64 * 1024); }
  catch (error) {
    const tooLarge = error instanceof RequestBodyError && error.code === 'too_large';
    return privateResponse(apiFail(tooLarge ? 'AVATAR_TOO_LARGE' : 'INVALID_UPLOAD', tooLarge ? 'Image must be under 2 MB' : 'Upload a valid image file', tooLarge ? 413 : 400));
  }
  const file = form.get('file');
  if (!(file instanceof File)) return privateResponse(apiFail('INVALID_UPLOAD', 'Upload a valid image file', 422));
  const metadata = validateAvatarFileMetadata(file);
  if (!metadata.ok) return privateResponse(apiFail(metadata.reason === 'size' ? 'AVATAR_TOO_LARGE' : 'INVALID_TYPE', metadata.reason === 'size' ? 'Image must be under 2 MB' : 'Allowed types: image/jpeg, image/png, image/webp', metadata.reason === 'size' ? 413 : 422));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateAvatarBytes(bytes, file.type);
  if (!validation.ok) return privateResponse(apiFail('INVALID_IMAGE', validation.message, 422));

  const digest = createHash('sha256').update(bytes).digest('hex');
  const ext = extension(validation.type);
  if (!ext) return privateResponse(apiFail('INVALID_TYPE', 'Allowed types: image/jpeg, image/png, image/webp', 422));
  const service = createServiceClient();
  const { data: profile, error: profileError } = await service.from('users').select('status,avatar_url,tier').eq('id', user.id).maybeSingle();
  if (profileError) return privateResponse(apiFail('AVATAR_UNAVAILABLE', 'Profile photo could not be saved', 503));
  if (profile?.status !== 'active') return privateResponse(apiFail('ACCOUNT_UNAVAILABLE', 'Your account cannot update its profile photo', 403));

  const bucket = service.storage.from('avatars');
  const { data: existingRows, error: existingError } = await service.rpc('find_profile_avatar_asset', {
    p_owner_user_id: user.id, p_digest: digest,
  });
  if (existingError) return privateResponse(apiFail('AVATAR_UNAVAILABLE', 'Profile photo could not be saved', 503));
  let verifiedLegacyPath: string | null = null;
  if (!Array.isArray(existingRows) || !existingRows.length) {
    const legacyPath = sameAccountLegacyAvatarPath(profile.avatar_url, user.id);
    if (legacyPath) {
      const legacy = await bucket.download(legacyPath);
      if (!legacy.error && legacy.data) {
        const legacyBytes = new Uint8Array(await legacy.data.arrayBuffer());
        if (createHash('sha256').update(legacyBytes).digest('hex') === digest) verifiedLegacyPath = legacyPath;
      }
    }
  }
  const candidatePath = `${user.id}/assets/${randomUUID()}.${ext}`;
  const { data: reservations, error: reservationError } = await service.rpc('reserve_profile_avatar_asset', {
    p_owner_user_id: user.id, p_digest: digest, p_storage_path: verifiedLegacyPath ?? candidatePath,
  });
  const asset = Array.isArray(reservations) ? reservations[0] as { storage_path: string; state: string } | undefined : undefined;
  if (reservationError || !asset) return privateResponse(apiFail('AVATAR_UNAVAILABLE', 'Profile photo could not be saved', 503));
  if (asset.state === 'deleting' || asset.state === 'deleted') return privateResponse(apiFail('AVATAR_RETRY', 'Profile photo is being cleaned up; retry shortly', 503));

  if (asset.state === 'pending') {
    if (verifiedLegacyPath !== asset.storage_path) {
      const uploaded = await bucket.upload(asset.storage_path, bytes, { contentType: validation.type, upsert: false });
      if (uploaded.error) {
        // A retry or concurrent request may have completed the same immutable path.
        const existing = await bucket.download(asset.storage_path);
        if (existing.error || !existing.data) return privateResponse(apiFail('AVATAR_RETRY', 'Profile photo upload is still processing; retry shortly', 503));
        const existingBytes = new Uint8Array(await existing.data.arrayBuffer());
        const existingDigest = createHash('sha256').update(existingBytes).digest('hex');
        if (existingDigest !== digest) return privateResponse(apiFail('AVATAR_UNAVAILABLE', 'Profile photo could not be saved', 503));
      }
    }
    const { data: activated, error: activationError } = await service.rpc('activate_profile_avatar_asset', {
      p_owner_user_id: user.id, p_digest: digest, p_storage_path: asset.storage_path,
    });
    if (activationError || activated !== true) return privateResponse(apiFail('AVATAR_RETRY', 'Profile photo upload is still processing; retry shortly', 503));
  }

  const { data: publicData } = bucket.getPublicUrl(asset.storage_path);
  const { data: bindingRows, error: bindingError } = await service.rpc('bind_profile_avatar_asset', {
    p_owner_user_id: user.id, p_digest: digest, p_storage_path: asset.storage_path,
    p_expected_avatar_url: profile.avatar_url, p_public_url: publicData.publicUrl,
  });
  const binding = Array.isArray(bindingRows) ? bindingRows[0] as { changed: boolean; avatar_url: string } | undefined : undefined;
  if (bindingError || !binding) {
    const conflict = bindingError?.message.includes('avatar_profile_changed');
    return privateResponse(apiFail(conflict ? 'PROFILE_CHANGED' : 'AVATAR_SAVE_FAILED', conflict ? 'Profile changed while the photo was uploading; reload and retry' : 'Profile photo could not be saved', conflict ? 409 : 503));
  }
  if (binding.changed) await auth.rpc('promote_to_profile_complete', { p_user_id: user.id });
  const { data: latest } = await service.from('users').select('tier').eq('id', user.id).maybeSingle();
  return privateResponse(apiOk({ confirmed: true, changed: binding.changed, avatarUrl: binding.avatar_url, tier: latest?.tier ?? profile.tier ?? null }));
}

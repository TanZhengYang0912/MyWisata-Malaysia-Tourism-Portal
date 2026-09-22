import { AVATAR_ALLOWED_TYPES, AVATAR_MAX_BYTES } from '@/lib/profile/avatar-validation';

export const MAX_VENDOR_GALLERY_IMAGES = 3;

export type GalleryFileValidation =
  | { ok: true }
  | { ok: false; reason: 'count' | 'type' | 'size' };

/** A vendor gallery is optional, but any replacement must contain three photos. */
export function validateVendorGalleryFiles(
  files: readonly Pick<File, 'type' | 'size'>[],
  options: { allowEmpty?: boolean } = {},
): GalleryFileValidation {
  if (files.length === 0 && options.allowEmpty !== false) return { ok: true };
  if (files.length !== MAX_VENDOR_GALLERY_IMAGES) return { ok: false, reason: 'count' };

  for (const file of files) {
    if (!AVATAR_ALLOWED_TYPES.includes(file.type as (typeof AVATAR_ALLOWED_TYPES)[number])) {
      return { ok: false, reason: 'type' };
    }
    if (file.size > AVATAR_MAX_BYTES) return { ok: false, reason: 'size' };
  }

  return { ok: true };
}

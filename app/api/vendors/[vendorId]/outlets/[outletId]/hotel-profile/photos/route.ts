import crypto from 'node:crypto';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeOutlet } from '@/lib/vendor-authorization';
import { isHotelOutlet } from '@/lib/customer/hotel-outlet';
import { validateAvatarBytes, validateAvatarFileMetadata } from '@/lib/profile/avatar-validation';
import { hotelPhotoPath } from '@/lib/vendor/hotel-profile';
import { MEDIA_RESERVE_FAILED, markVendorMediaObjectStored, reserveVendorMediaObject } from '@/lib/vendor/media-objects';

const BUCKET = 'vendor-products';
const IMAGE_EXTENSION: Record<string, 'jpg' | 'png' | 'webp'> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

interface Props { params: Promise<{ vendorId: string; outletId: string }> }

/** Uploads one hotel profile photo. It only goes live when an admin approves the profile it is part of. */
export async function POST(request: Request, { params }: Props) {
  const { vendorId, outletId } = await params;
  const result = await authorizeOutlet(vendorId, outletId);
  if (!result.ok) return result.response;
  if (!await isHotelOutlet(result.access.serviceDb, outletId)) return apiFail('NOT_A_HOTEL', 'Hotel photos are only for outlets that sell rooms', 409);

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return apiFail('INVALID_FORM', 'Send the photo as form data', 400);
  }
  if (!(file instanceof File)) return apiFail('PHOTO_REQUIRED', 'Choose a photo to upload', 422);

  const metadata = validateAvatarFileMetadata(file);
  if (!metadata.ok) return apiFail(metadata.reason === 'type' ? 'INVALID_IMAGE_TYPE' : 'IMAGE_TOO_LARGE', 'Choose a JPG, PNG, or WebP image up to 2 MB.', 422);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateAvatarBytes(bytes, file.type);
  if (!validation.ok) return apiFail('INVALID_IMAGE_CONTENT', validation.message, 422);

  const path = `${hotelPhotoPath(vendorId, outletId)}${crypto.randomUUID()}.${IMAGE_EXTENSION[validation.type]}`;
  const reserved = await reserveVendorMediaObject(result.access.serviceDb, { bucket: BUCKET, path, vendorId, userId: result.access.userId, purpose: 'hotel_photo' });
  if (!reserved.ok) return apiFail(MEDIA_RESERVE_FAILED.code, MEDIA_RESERVE_FAILED.message, MEDIA_RESERVE_FAILED.status);
  const storage = result.access.serviceDb.storage.from(BUCKET);
  const upload = await storage.upload(path, bytes, { contentType: validation.type, upsert: false });
  if (upload.error) return apiFail('UPLOAD_FAILED', 'The photo could not be uploaded. Try again.', 502);
  await markVendorMediaObjectStored(result.access.serviceDb, reserved.objectId);
  return apiOk({ url: storage.getPublicUrl(path).data.publicUrl }, { status: 201 });
}

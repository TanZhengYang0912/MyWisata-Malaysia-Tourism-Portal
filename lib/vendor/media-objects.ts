import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/log';

/**
 * Vendor media upload registry (docs/plans/2026-11-14-1610-vendor-media-upload-cleanup.md).
 *
 * Upload routes call `reserveVendorMediaObject` after authorization and BEFORE
 * writing to Storage: if the reservation fails, nothing is uploaded, so every
 * new object is known to the later reference-checked cleanup. After a
 * successful upload they call `markVendorMediaObjectStored`. A failed mark only
 * leaves the row "reserved", which the cleanup treats the same way, so it is
 * logged rather than failing the vendor's upload.
 */
export type VendorMediaBucket = 'vendor-products' | 'event-posters';
export type VendorMediaPurpose = 'product_media' | 'hotel_photo' | 'event_poster' | 'vendor_gallery';

export async function reserveVendorMediaObject(
  serviceDb: SupabaseClient,
  input: { bucket: VendorMediaBucket; path: string; vendorId: string; userId: string; purpose: VendorMediaPurpose },
): Promise<{ ok: true; objectId: string } | { ok: false }> {
  const { data, error } = await serviceDb.rpc('reserve_vendor_media_object', {
    p_bucket: input.bucket,
    p_storage_path: input.path,
    p_vendor_id: input.vendorId,
    p_uploaded_by: input.userId,
    p_purpose: input.purpose,
  });
  if (error || typeof data !== 'string') {
    log('error', '[vendor-media] reserve failed', { bucket: input.bucket, purpose: input.purpose, error: error?.message ?? 'no id returned' });
    return { ok: false };
  }
  return { ok: true, objectId: data };
}

export async function markVendorMediaObjectStored(serviceDb: SupabaseClient, objectId: string): Promise<void> {
  const { data, error } = await serviceDb.rpc('mark_vendor_media_object_stored', { p_object_id: objectId });
  if (error || data !== true) {
    log('warn', '[vendor-media] mark stored failed', { objectId, error: error?.message ?? 'not reserved' });
  }
}

/** Shared 500 for a failed reservation, so no route uploads an untracked file. */
export const MEDIA_RESERVE_FAILED = { code: 'UPLOAD_UNAVAILABLE', message: 'Uploads are temporarily unavailable. Please try again.', status: 503 } as const;

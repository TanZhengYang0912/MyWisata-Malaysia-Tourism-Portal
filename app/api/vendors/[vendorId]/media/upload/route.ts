import crypto from 'node:crypto';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { validateMagicBytes } from '@/lib/kyc/magic-bytes';
import { DIGITAL_ASSET_BUCKET, digitalAssetUrl } from '@/lib/vendor/digital-assets';
import { MEDIA_RESERVE_FAILED, markVendorMediaObjectStored, reserveVendorMediaObject } from '@/lib/vendor/media-objects';

const BUCKET = 'vendor-products';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DIGITAL_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DIGITAL_TYPES = new Set(['application/pdf', 'application/zip']);

interface Props { params: Promise<{ vendorId: string }> }

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'upload';
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  const formData = await request.formData();
  const file = formData.get('file');
  const kind = String(formData.get('kind') || 'image');
  const productId = String(formData.get('productId') || '');
  if (!(file instanceof File)) return apiFail('INVALID_FILE', 'Choose a file to upload.', 422);

  const allowedTypes = kind === 'digital' ? DIGITAL_TYPES : IMAGE_TYPES;
  const maxBytes = kind === 'digital' ? MAX_DIGITAL_BYTES : MAX_IMAGE_BYTES;
  if (!allowedTypes.has(file.type)) {
    return apiFail('INVALID_FILE_TYPE', kind === 'digital' ? 'Upload a PDF or ZIP file.' : 'Upload a JPG, PNG, or WebP image.', 422);
  }
  if (file.size > maxBytes) return apiFail('FILE_TOO_LARGE', 'Files must be 10 MB or smaller.', 422);
  // The declared type comes from the browser; check the bytes really are that kind of file.
  const bytes = await file.arrayBuffer();
  if (!(await validateMagicBytes(bytes, file.type))) {
    return apiFail('INVALID_FILE_CONTENT', kind === 'digital' ? 'This file is not a valid PDF or ZIP.' : 'This file is not a valid JPG, PNG, or WebP image.', 422);
  }

  if (productId) {
    const { data: product } = await access.access.serviceDb
      .from('products')
      .select('id,outlet_id')
      .eq('id', productId)
      .eq('vendor_id', vendorId)
      .in('outlet_id', access.access.outletIds)
      .maybeSingle();
    if (!product) return apiFail('FORBIDDEN', 'This product is outside your assigned outlet scope.', 403);
  }

  const path = [vendorId, productId || ('draft-' + access.access.userId), crypto.randomUUID() + '-' + safeName(file.name)].join('/');
  // Paid downloads go to the private bucket; only the paid-order download route can read them.
  const bucket = kind === 'digital' ? DIGITAL_ASSET_BUCKET : BUCKET;
  // Register public images before writing them, so the cleanup sweep knows every new object.
  let mediaObjectId: string | null = null;
  if (kind !== 'digital') {
    const reserved = await reserveVendorMediaObject(access.access.serviceDb, { bucket: BUCKET, path, vendorId, userId: access.access.userId, purpose: 'product_media' });
    if (!reserved.ok) return apiFail(MEDIA_RESERVE_FAILED.code, MEDIA_RESERVE_FAILED.message, MEDIA_RESERVE_FAILED.status);
    mediaObjectId = reserved.objectId;
  }
  const { error } = await access.access.serviceDb.storage.from(bucket).upload(path, bytes, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) return apiFail('UPLOAD_FAILED', error.message, 500);
  if (mediaObjectId) await markVendorMediaObjectStored(access.access.serviceDb, mediaObjectId);

  const url = kind === 'digital'
    ? digitalAssetUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, path)
    : access.access.serviceDb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return apiOk({
    url,
    path,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    kind,
  });
}

import crypto from 'node:crypto';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor, type VendorAccess } from '@/lib/vendor-authorization';
import { validateAvatarBytes, validateAvatarFileMetadata } from '@/lib/profile/avatar-validation';
import { validateVendorGalleryFiles } from '@/lib/vendor/gallery-files';

const BUCKET = 'vendor-products';
const IMAGE_EXTENSION: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

interface Props { params: Promise<{ vendorId: string }> }
type StoredGalleryPhoto = { id: string; url: string; alt_text: string | null; sort_order: number | null };
type GalleryFile = { bytes: Uint8Array; contentType: string; extension: 'jpg' | 'png' | 'webp' };

function isDefiniteRpcRejection(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && (/^[0-9A-Z]{5}$/.test(error.code) || /^PGRST\d+$/.test(error.code)));
}

function galleryRows(rows: StoredGalleryPhoto[] | null | undefined) {
  return (rows ?? [])
    .filter((row) => row.sort_order !== -1 && !row.alt_text?.toLowerCase().includes(' logo') && row.url?.trim())
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
    .map((row) => ({ id: row.id, url: row.url, altText: row.alt_text, sortOrder: row.sort_order }));
}

function matchesGallery(rows: Array<{ url: string }>, photos: Array<{ url: string }>) {
  return rows.length === photos.length && rows.every((row, index) => row.url === photos[index].url);
}

async function readGallery(serviceDb: VendorAccess['serviceDb'], vendorId: string) {
  const { data, error } = await serviceDb
    .from('media_assets')
    .select('id,url,alt_text,sort_order')
    .eq('vendor_id', vendorId)
    .is('outlet_id', null)
    .is('product_id', null)
    .in('media_type', ['image', 'gallery'])
    .order('sort_order', { ascending: true });
  if (error) return { error };
  return { rows: galleryRows((data ?? []) as StoredGalleryPhoto[]) };
}

function managedGalleryPath(url: string, vendorId: string, userId: string): string | null {
  const marker = '/storage/v1/object/public/vendor-products/';
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;

  let path: string;
  try {
    path = decodeURIComponent(url.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
  if (path.includes('..') || path.includes('\\')) return null;

  const vendorPrefix = `${vendorId}/gallery/`;
  if (path.startsWith(vendorPrefix) && /^[^/]+\.(?:jpg|png|webp)$/i.test(path.slice(vendorPrefix.length))) return path;

  const registrationPrefix = `${userId}/registrations/`;
  const registrationName = path.startsWith(registrationPrefix) ? path.slice(registrationPrefix.length) : '';
  if (/^[0-9a-f-]+-gallery-[0-2]\.(?:jpg|png|webp)$/i.test(registrationName)) return path;
  return null;
}

async function removeObjects(serviceDb: VendorAccess['serviceDb'], paths: string[]) {
  if (!paths.length) return true;
  try {
    const { error } = await serviceDb.storage.from(BUCKET).remove(paths);
    if (!error) return true;
    console.error('Vendor gallery object cleanup failed', { count: paths.length, error: error.message });
    return false;
  } catch (error) {
    console.error('Vendor gallery object cleanup failed', { count: paths.length, error: error instanceof Error ? error.message : 'Unknown error' });
    return false;
  }
}

async function prepareGalleryFiles(request: Request): Promise<{ ok: true; files: GalleryFile[] } | { ok: false; response: Response }> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return { ok: false, response: apiFail('INVALID_FORM', 'Choose three gallery image files.', 400) };
  }

  const values = formData.getAll('galleryFiles');
  if (values.some((value) => !(value instanceof File))) {
    return { ok: false, response: apiFail('INVALID_IMAGE', 'Choose valid gallery image files.', 422) };
  }
  const files = values as File[];
  const selection = validateVendorGalleryFiles(files, { allowEmpty: false });
  if (!selection.ok) {
    if (selection.reason === 'count') return { ok: false, response: apiFail('INVALID_GALLERY_COUNT', 'Choose exactly three gallery photos.', 422) };
    if (selection.reason === 'type') return { ok: false, response: apiFail('INVALID_IMAGE_TYPE', 'Upload JPG, PNG, or WebP images.', 422) };
    return { ok: false, response: apiFail('IMAGE_TOO_LARGE', 'Images must be 2 MB or smaller.', 422) };
  }

  const prepared: GalleryFile[] = [];
  for (const file of files) {
    const metadata = validateAvatarFileMetadata(file);
    if (!metadata.ok) {
      return { ok: false, response: apiFail(metadata.reason === 'type' ? 'INVALID_IMAGE_TYPE' : 'IMAGE_TOO_LARGE', 'Choose JPG, PNG, or WebP images up to 2 MB each.', 422) };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateAvatarBytes(bytes, file.type);
    if (!validation.ok) return { ok: false, response: apiFail('INVALID_IMAGE_CONTENT', validation.message, 422) };
    prepared.push({ bytes, contentType: validation.type, extension: IMAGE_EXTENSION[validation.type] });
  }

  return { ok: true, files: prepared };
}

export async function GET(_request: Request, { params }: Props) {
  const { vendorId } = await params;
  const result = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!result.ok) return result.response;

  const current = await readGallery(result.access.serviceDb, vendorId);
  if (current.error) return apiFail('DB_ERROR', current.error.message, 500);
  return apiOk(current.rows);
}

export async function PUT(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const result = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!result.ok) return result.response;

  const prepared = await prepareGalleryFiles(request);
  if (!prepared.ok) return prepared.response;
  const current = await readGallery(result.access.serviceDb, vendorId);
  if (current.error) return apiFail('DB_ERROR', current.error.message, 500);

  const uploadedPaths: string[] = [];
  const photos: Array<{ id: string; url: string; altText: string; sortOrder: number }> = [];
  for (const [index, file] of prepared.files.entries()) {
    const path = `${vendorId}/gallery/${crypto.randomUUID()}-gallery-${index}.${file.extension}`;
    let uploadError: { message: string } | null = null;
    try {
      const upload = await result.access.serviceDb.storage.from(BUCKET).upload(path, file.bytes, {
        contentType: file.contentType,
        cacheControl: '3600',
        upsert: false,
      });
      uploadError = upload.error;
    } catch (error) {
      uploadError = { message: error instanceof Error ? error.message : 'Unknown upload error' };
    }
    if (uploadError) {
      console.error('Vendor gallery image upload failed', { index, error: uploadError.message });
      const cleaned = await removeObjects(result.access.serviceDb, uploadedPaths);
      return cleaned
        ? apiFail('IMAGE_UPLOAD_FAILED', 'Unable to upload the selected gallery photos.', 502)
        : apiFail('IMAGE_CLEANUP_FAILED', 'The gallery upload could not be safely cleaned up.', 500);
    }
    uploadedPaths.push(path);
    const url = result.access.serviceDb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    photos.push({ id: path, url, altText: `Business gallery image ${index + 1}`, sortOrder: index });
  }

  let replacementError: { code?: string; message?: string } | null = null;
  let replacementOutcomeUnknown = false;
  try {
    const replacement = await result.access.authDb.rpc('set_vendor_gallery', {
      p_vendor_id: vendorId,
      p_gallery: photos.map((photo) => photo.url),
    });
    replacementError = replacement.error;
  } catch (error) {
    console.error('Vendor gallery replacement RPC failed', error instanceof Error ? error.message : 'Unknown error');
    replacementOutcomeUnknown = true;
  }

  if (replacementOutcomeUnknown || (replacementError && !isDefiniteRpcRejection(replacementError))) {
    const reconciliation = await readGallery(result.access.serviceDb, vendorId);
    if (reconciliation.error || !matchesGallery(reconciliation.rows, photos)) {
      return apiFail(
        'GALLERY_STATUS_UNCONFIRMED',
        'We could not confirm whether the gallery was saved. Refresh before trying again.',
        503,
      );
    }
  } else if (replacementError) {
    const cleaned = await removeObjects(result.access.serviceDb, uploadedPaths);
    if (!cleaned) return apiFail('IMAGE_CLEANUP_FAILED', 'The gallery upload could not be safely cleaned up.', 500);
    return apiFail('DB_ERROR', 'Unable to update the vendor gallery.', 500);
  }

  const oldPaths = [...new Set(current.rows
    .map((photo) => managedGalleryPath(photo.url, vendorId, result.access.userId))
    .filter((path): path is string => path !== null && !uploadedPaths.includes(path)))];
  const cleanupWarning = !(await removeObjects(result.access.serviceDb, oldPaths));
  return apiOk({ items: photos, cleanupWarning });
}

export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId } = await params;
  const result = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!result.ok) return result.response;

  const current = await readGallery(result.access.serviceDb, vendorId);
  if (current.error) return apiFail('DB_ERROR', current.error.message, 500);

  const cleared = await result.access.authDb.rpc('set_vendor_gallery', { p_vendor_id: vendorId, p_gallery: [] });
  if (cleared.error) return apiFail('DB_ERROR', 'Unable to clear the vendor gallery.', 500);

  const paths = [...new Set(current.rows
    .map((photo) => managedGalleryPath(photo.url, vendorId, result.access.userId))
    .filter((path): path is string => path !== null))];
  const cleanupWarning = !(await removeObjects(result.access.serviceDb, paths));
  return apiOk({ cleared: true, cleanupWarning });
}

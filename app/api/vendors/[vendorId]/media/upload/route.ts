import crypto from 'node:crypto';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

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
  const { error } = await access.access.serviceDb.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) return apiFail('UPLOAD_FAILED', error.message, 500);

  const { data: publicUrl } = access.access.serviceDb.storage.from(BUCKET).getPublicUrl(path);
  return apiOk({
    url: publicUrl.publicUrl,
    path,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    kind,
  });
}

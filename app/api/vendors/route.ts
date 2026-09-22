// P2 — Member 2 owns GET /api/vendors + POST /api/vendors

import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { vendorRegisterSchema } from '@/lib/validation/vendor-schemas';
import { validateAvatarBytes, validateAvatarFileMetadata } from '@/lib/profile/avatar-validation';
import { validateVendorGalleryFiles } from '@/lib/vendor/gallery-files';

const VENDOR_MEDIA_BUCKET = 'vendor-products';

type RegistrationImage = {
  field: 'logoFile' | 'coverFile' | 'galleryFile';
  galleryIndex?: number;
  bytes: Uint8Array;
  contentType: string;
  extension: 'jpg' | 'png' | 'webp';
};

function isDefiniteRpcRejection(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && (/^[0-9A-Z]{5}$/.test(error.code) || /^PGRST\d+$/.test(error.code)));
}

async function removeRegistrationImages(serviceDb: ReturnType<typeof createServiceClient>, paths: string[]) {
  if (!paths.length) return true;
  const { error } = await serviceDb.storage.from(VENDOR_MEDIA_BUCKET).remove(paths);
  if (!error) return true;
  console.error('Vendor registration image cleanup failed', { count: paths.length, error: error.message });
  return false;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const url = new URL(request.url);
  const city     = url.searchParams.get('city');
  const category = url.searchParams.get('category');
  const status   = url.searchParams.get('status');
  const q        = url.searchParams.get('q');

  let query = supabase
    .from('vendors')
    .select('*, outlets(id, name, city, lat, lng, status)')
    .eq('status', status ?? 'approved');

  if (q) query = query.ilike('name', `%${q}%`);
  if (city) query = query.contains('outlets', [{ city }]);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
  if (error) return apiFail('DB_ERROR', error.message, 500);

  // If category filter, post-filter vendors that have products in that category
  let filtered = data ?? [];
  if (category) {
    const vendorIds = filtered.map((v: { id: string }) => v.id);
    const { data: products } = await supabase
      .from('products')
      .select('vendor_id, categories(slug)')
      .in('vendor_id', vendorIds.length ? vendorIds : ['none'])
      .eq('status', 'active');

    const matchingVendorIds = new Set(
      (products ?? [])
        .filter((p: { categories: unknown; vendor_id: string }) => (p.categories as { slug: string } | null)?.slug === category)
        .map((p: { vendor_id: string }) => p.vendor_id),
    );
    filtered = filtered.filter((v: { id: string }) => matchingVendorIds.has(v.id));
  }

  return apiOk(filtered);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  let multipart: FormData | null = null;
  let registrationRequest = request;
  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    try {
      multipart = await request.formData();
    } catch {
      return apiFail('INVALID_FORM', 'Could not parse registration form', 400);
    }

    const values: Record<string, string> = {};
    for (const [key, value] of multipart.entries()) {
      if (key === 'logoFile' || key === 'coverFile' || key === 'galleryFiles') continue;
      if (typeof value !== 'string') return apiFail('INVALID_FORM', 'Registration fields must be text', 400);
      values[key] = value;
    }
    registrationRequest = new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
  }

  const parsed = await parseBody(registrationRequest, vendorRegisterSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const imageSlots = ['logoFile', 'coverFile'] as const;
  const registrationImages: RegistrationImage[] = [];
  if (multipart) {
    const galleryValues = multipart.getAll('galleryFiles');
    const galleryValidation = validateVendorGalleryFiles(
      galleryValues.filter((value): value is File => value instanceof File),
      { allowEmpty: true },
    );
    if (!galleryValidation.ok) {
      if (galleryValidation.reason === 'count') return apiFail('INVALID_GALLERY_COUNT', 'Choose either no gallery photos or exactly three.', 422);
      if (galleryValidation.reason === 'type') return apiFail('INVALID_IMAGE_TYPE', 'Upload a JPG, PNG, or WebP image.', 422);
      return apiFail('IMAGE_TOO_LARGE', 'Images must be 2 MB or smaller.', 422);
    }
    if (galleryValues.some((value) => !(value instanceof File))) {
      return apiFail('INVALID_IMAGE', 'Choose valid gallery image files.', 422);
    }

    const imageInputs: Array<{ field: RegistrationImage['field']; galleryIndex?: number; file: File }> = [];
    for (const field of imageSlots) {
      const value = multipart.get(field);
      if (value === null) continue;
      if (!(value instanceof File)) return apiFail('INVALID_IMAGE', 'Choose a valid image file.', 422);
      imageInputs.push({ field, file: value });
    }
    galleryValues.forEach((value, galleryIndex) => {
      imageInputs.push({ field: 'galleryFile', galleryIndex, file: value as File });
    });

    for (const input of imageInputs) {
      const metadata = validateAvatarFileMetadata(input.file);
      if (!metadata.ok) {
        return metadata.reason === 'type'
          ? apiFail('INVALID_IMAGE_TYPE', 'Upload a JPG, PNG, or WebP image.', 422)
          : apiFail('IMAGE_TOO_LARGE', 'Images must be 2 MB or smaller.', 422);
      }

      const bytes = new Uint8Array(await input.file.arrayBuffer());
      const validation = validateAvatarBytes(bytes, input.file.type);
      if (!validation.ok) return apiFail('INVALID_IMAGE_CONTENT', validation.message, 422);

      registrationImages.push({
        field: input.field,
        galleryIndex: input.galleryIndex,
        bytes,
        contentType: validation.type,
        extension: validation.type === 'image/png' ? 'png' : validation.type === 'image/webp' ? 'webp' : 'jpg',
      });
    }
  }

  const uploadedPaths: string[] = [];
  const imageUrls: Partial<Record<'logoFile' | 'coverFile', string>> = {};
  const galleryUrls: string[] = [];
  let serviceDb: ReturnType<typeof createServiceClient> | null = null;
  if (registrationImages.length) {
    try {
      serviceDb = createServiceClient();
      for (const image of registrationImages) {
        const imageLabel = image.field === 'galleryFile' ? `gallery-${image.galleryIndex}` : image.field;
        const path = `${user.id}/registrations/${crypto.randomUUID()}-${imageLabel}.${image.extension}`;
        const { error: uploadError } = await serviceDb.storage.from(VENDOR_MEDIA_BUCKET).upload(path, image.bytes, {
          contentType: image.contentType,
          cacheControl: '3600',
          upsert: false,
        });
        if (uploadError) {
          console.error('Vendor registration image upload failed', { field: imageLabel, error: uploadError.message });
          const cleaned = await removeRegistrationImages(serviceDb, uploadedPaths);
          return cleaned
            ? apiFail('IMAGE_UPLOAD_FAILED', 'Unable to upload the selected image.', 502)
            : apiFail('IMAGE_CLEANUP_FAILED', 'The image upload could not be safely cleaned up.', 500);
        }
        uploadedPaths.push(path);
        const publicUrl = serviceDb.storage.from(VENDOR_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
        if (image.field === 'galleryFile') galleryUrls.push(publicUrl);
        else imageUrls[image.field] = publicUrl;
      }
    } catch (error) {
      console.error('Vendor registration image upload failed', error instanceof Error ? error.message : 'Unknown error');
      const cleaned = serviceDb ? await removeRegistrationImages(serviceDb, uploadedPaths) : true;
      return cleaned
        ? apiFail('IMAGE_UPLOAD_FAILED', 'Unable to upload the selected image.', 502)
        : apiFail('IMAGE_CLEANUP_FAILED', 'The image upload could not be safely cleaned up.', 500);
    }
  }

  const registrationBody = {
    ...body,
    logoUrl: imageUrls.logoFile ?? body.logoUrl,
    coverUrl: imageUrls.coverFile ?? body.coverUrl,
  };

  // One RPC, one transaction: vendor + onboarding profile + first outlet are
  // created together or not at all. It also takes a per-user advisory lock and
  // re-checks for an existing vendor inside it, so a double-clicked Register
  // cannot create two vendors. Slug collisions are resolved server-side.
  let created: unknown;
  let registrationError: { message: string; code?: string } | null = null;
  let registrationOutcomeUnknown = false;
  try {
    const registration = await supabase.rpc('register_vendor_with_outlet', {
      p_name: registrationBody.name,
      p_slug: registrationBody.slug ?? null,
      p_description: registrationBody.description ?? null,
      p_business_type: registrationBody.businessType ?? null,
      p_legal_business_name: registrationBody.legalBusinessName ?? null,
      p_registration_number: registrationBody.registrationNumber ?? null,
      p_contact_name: registrationBody.contactName ?? null,
      p_contact_email: registrationBody.contactEmail || user.email || null,
      p_contact_phone: registrationBody.contactPhone ?? null,
      p_business_address: registrationBody.businessAddress ?? null,
      p_logo_url: registrationBody.logoUrl || null,
      p_cover_url: registrationBody.coverUrl || null,
      p_gallery: galleryUrls,
    });
    created = registration.data;
    registrationError = registration.error;
  } catch (error) {
    registrationOutcomeUnknown = true;
    console.error('Vendor registration RPC failed', error instanceof Error ? error.message : 'Unknown error');
  }

  if (registrationOutcomeUnknown || (registrationError && !isDefiniteRpcRejection(registrationError))) {
    return apiFail(
      'REGISTRATION_STATUS_UNCONFIRMED',
      'We could not confirm whether your application was saved. Refresh your vendor profile before trying again.',
      503,
    );
  }

  if (registrationError) {
    const cleaned = serviceDb ? await removeRegistrationImages(serviceDb, uploadedPaths) : true;
    if (!cleaned) return apiFail('IMAGE_CLEANUP_FAILED', 'The image upload could not be safely cleaned up.', 500);
    if (registrationError.message.includes('vendor_exists')) return apiFail('DUPLICATE', 'You already have a vendor', 409);
    if (registrationError.message.includes('unauthorized')) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
    if (registrationError.message.includes('invalid_name')) return apiFail('VALIDATION_ERROR', 'Vendor name must contain letters or numbers', 400);
    return apiFail('DB_ERROR', registrationError.message, 400);
  }

  const { vendor_id: vendorId } = created as { vendor_id: string };
  const { data } = await supabase.from('vendors').select('*').eq('id', vendorId).single();
  return apiOk(data, { status: 201 });
}

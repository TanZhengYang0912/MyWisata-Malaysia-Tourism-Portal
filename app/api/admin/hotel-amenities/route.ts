import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { createServiceClient } from '@/lib/supabase/service';
import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { createHotelAmenitySchema, toggleHotelAmenitySchema } from '@/lib/validation/hotel-amenity-schemas';

// The amenity checklist is catalogue configuration, so catalogue reviewers manage it.
async function requireAmenityAdmin(): Promise<{ error: Response } | { db: ReturnType<typeof createServiceClient> }> {
  const auth = await requireStaffPermission('admin.catalogue.review');
  if (auth.response) return { error: auth.response };
  if (!auth.user) return { error: apiFail('UNAUTHORIZED', 'Sign in required', 401) };
  return { db: createServiceClient() };
}

export async function GET() {
  const auth = await requireAmenityAdmin();
  if ('error' in auth) return auth.error;
  const { data, error } = await auth.db.from('hotel_amenities').select('code,label_en,label_ms,label_zh,icon,sort_order,is_active').order('sort_order');
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ amenities: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAmenityAdmin();
  if ('error' in auth) return auth.error;
  const parsed = await parseBody(request, createHotelAmenitySchema);
  if (!parsed.ok) return parsed.response;
  const { code, labelEn, labelMs, labelZh, icon } = parsed.data;
  const { data, error } = await auth.db.from('hotel_amenities')
    .insert({ code, label_en: labelEn, label_ms: labelMs, label_zh: labelZh, icon })
    .select('code,label_en,label_ms,label_zh,icon,sort_order,is_active')
    .single();
  if (error?.code === '23505') return apiFail('DUPLICATE_AMENITY', 'An amenity with this code already exists', 409);
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ amenity: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAmenityAdmin();
  if ('error' in auth) return auth.error;
  const parsed = await parseBody(request, toggleHotelAmenitySchema);
  if (!parsed.ok) return parsed.response;
  const { data, error } = await auth.db.from('hotel_amenities')
    .update({ is_active: parsed.data.isActive })
    .eq('code', parsed.data.code)
    .select('code,is_active')
    .single();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ amenity: data });
}

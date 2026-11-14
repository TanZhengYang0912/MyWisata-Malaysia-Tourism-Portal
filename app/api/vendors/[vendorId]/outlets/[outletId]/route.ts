// P2 — Member 2: Single outlet GET/PATCH/DELETE (B2)

import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { hotelProfileSchema, outletUpdateSchema } from '@/lib/validation/vendor-schemas';
import { authorizeOutlet, authorizeVendor } from '@/lib/vendor-authorization';
import { isHotelOutlet } from '@/lib/customer/hotel-outlet';
import { getPendingHotelProfile, loadLiveHotelProfile, upsertPendingHotelProfile } from '@/lib/vendor/hotel-profile';

interface Props { params: Promise<{ vendorId: string; outletId: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { vendorId, outletId } = await params;
  const access = await authorizeOutlet(vendorId, outletId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;

  const { data, error } = await supabase
    .from('outlets')
    .select('*, products(count), outlet_managers(user_id, users(full_name, email))')
    .eq('id', outletId)
    .single();

  if (error || !data) return apiFail('NOT_FOUND', 'Outlet not found', 404);
  return apiOk(data);
}

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, outletId } = await params;
  const access = await authorizeOutlet(vendorId, outletId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;

  const parsed = await parseBody(request, outletUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const taxonomyFields = ['badgeSlugs', 'accommodationTypeSlugs'];
  const managerEditableFields = ['operatingHours', 'welcomeMessage', 'welcomeEnabled'];
  if (body.operatingHours !== undefined && !access.access.isOutletManager) {
    return apiFail('FORBIDDEN', 'Only Outlet Managers can update operating hours', 403);
  }
  if (access.access.isOutletManager && Object.keys(body).some((key) => !managerEditableFields.includes(key))) {
    return apiFail('FORBIDDEN', 'Outlet managers can update operating hours and welcome message only', 403);
  }

  const contentChanged = Object.keys(body).some((key) => !managerEditableFields.includes(key) && !taxonomyFields.includes(key));

  if (body.accommodationTypeSlugs?.length && !await isHotelOutlet(supabase, outletId)) {
    return apiFail('INVALID_PROPERTY_TYPES', 'Accommodation property types can only be assigned to an outlet selling accommodation', 422);
  }

  // Hotels (D13): owner edits wait for admin review while the hotel stays live; manager fields still apply directly.
  if (contentChanged && !access.access.isOutletManager && await isHotelOutlet(supabase, outletId)) {
    // The outlet form re-sends every field filled from the live outlet, so only values that differ from
    // live are changes; anything else keeps whatever is already pending.
    const live = await loadLiveHotelProfile(supabase, outletId);
    const base = (await getPendingHotelProfile(supabase, outletId))?.payload ?? live;
    const amenityCodes = new Set(base.amenityCodes);
    const liveHas = (code: string) => live.amenityCodes.includes(code);
    if (typeof body.wheelchairAccessible === 'boolean' && body.wheelchairAccessible !== liveHas('accessible')) amenityCodes[body.wheelchairAccessible ? 'add' : 'delete']('accessible');
    if (typeof body.petFriendly === 'boolean' && body.petFriendly !== liveHas('pets_allowed')) amenityCodes[body.petFriendly ? 'add' : 'delete']('pets_allowed');
    const merged = hotelProfileSchema.safeParse({
      ...base,
      ...Object.fromEntries((['name', 'address', 'city', 'state', 'postcode', 'country', 'phone', 'email', 'lat', 'lng'] as const)
        .filter((key) => body[key] !== undefined && body[key] !== live[key]).map((key) => [key, body[key]])),
      amenityCodes: [...amenityCodes],
    });
    if (!merged.success) return apiFail('VALIDATION_FAILED', 'Hotel details failed validation', 422, merged.error.flatten());
    const profile = merged.data;
    await upsertPendingHotelProfile(supabase, { outletId, vendorId, userId: access.access.userId, profile });
    const directUpdate: Record<string, unknown> = {};
    if (body.welcomeMessage !== undefined) directUpdate.welcome_message = body.welcomeMessage || null;
    if (body.welcomeEnabled !== undefined) directUpdate.welcome_enabled = body.welcomeEnabled;
    if (Object.keys(directUpdate).length) {
      const { error } = await supabase.from('outlets').update(directUpdate).eq('id', outletId).eq('vendor_id', vendorId).select().single();
      if (error) return apiFail('DB_ERROR', error.message, 500);
    }
    return apiOk({ pendingReview: true }, { status: 202 });
  }

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.address !== undefined) updateData.address = body.address;
  if (body.city !== undefined) updateData.city = body.city;
  if (body.state !== undefined) updateData.state = body.state;
  if (body.postcode !== undefined) updateData.postcode = body.postcode;
  if (body.country !== undefined) updateData.country = body.country;
  if (body.lat !== undefined) updateData.lat = body.lat;
  if (body.lng !== undefined) updateData.lng = body.lng;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.email !== undefined) updateData.email = body.email || null;
  if (body.operatingHours !== undefined) updateData.operating_hours = body.operatingHours;
  if (body.welcomeMessage !== undefined) updateData.welcome_message = body.welcomeMessage || null;
  if (body.welcomeEnabled !== undefined) updateData.welcome_enabled = body.welcomeEnabled;
  if (body.wheelchairAccessible !== undefined) updateData.wheelchair_accessible = body.wheelchairAccessible;
  if (body.petFriendly !== undefined) updateData.pet_friendly = body.petFriendly;
  if (body.foodServiceModes !== undefined) updateData.food_service_modes = body.foodServiceModes;
  if (body.badgeSlugs !== undefined) updateData.badge_slugs = body.badgeSlugs;
  if (body.accommodationTypeSlugs !== undefined) updateData.accommodation_type_slugs = body.accommodationTypeSlugs;

  if (contentChanged && !access.access.isOutletManager) {
    updateData.review_status = 'pending_review';
    updateData.review_note = null;
    updateData.reviewed_by = null;
    updateData.reviewed_at = null;
    updateData.status = 'inactive';
  }

  const { data, error } = await supabase
    .from('outlets')
    .update(updateData)
    .eq('id', outletId)
    .eq('vendor_id', vendorId)
    .select()
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(data);
}

export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId, outletId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  if (!access.access.outletIds.includes(outletId)) return apiFail('NOT_FOUND', 'Outlet not found', 404);
  const supabase = access.access.serviceDb;

  // Soft close: only the status changes. Orders, bookings, products and
  // manager assignments are left untouched; reopening sets it back to active.
  const { data, error } = await supabase
    .from('outlets')
    .update({ status: 'closed' })
    .eq('id', outletId)
    .eq('vendor_id', vendorId)
    .select('id,status')
    .maybeSingle();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (!data) return apiFail('NOT_FOUND', 'Outlet not found', 404);
  return apiOk({ id: data.id, status: data.status });
}

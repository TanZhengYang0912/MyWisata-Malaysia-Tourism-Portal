// P2 — Member 2: Single outlet GET/PATCH/DELETE (B2)

import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { outletUpdateSchema } from '@/lib/validation/vendor-schemas';
import { authorizeOutlet, authorizeVendor } from '@/lib/vendor-authorization';

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
  const managerEditableFields = ['operatingHours', 'welcomeMessage', 'welcomeEnabled'];
  if (access.access.isOutletManager && Object.keys(body).some((key) => !managerEditableFields.includes(key))) {
    return apiFail('FORBIDDEN', 'Outlet managers can update operating hours and welcome message only', 403);
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

  const contentChanged = Object.keys(body).some((key) => !managerEditableFields.includes(key));
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
  const supabase = access.access.serviceDb;

  // Soft delete — set status to 'closed'
  const { error } = await supabase
    .from('outlets')
    .update({ status: 'closed' })
    .eq('id', outletId)
    .eq('vendor_id', vendorId);

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ id: outletId, status: 'closed' });
}

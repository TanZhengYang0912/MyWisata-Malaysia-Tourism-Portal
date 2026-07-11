// P2 — Member 2: Single outlet GET/PATCH/DELETE (B2)

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { outletUpdateSchema } from '@/lib/validation/vendor-schemas';

interface Props { params: Promise<{ vendorId: string; outletId: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { outletId } = await params;
  const supabase = await createClient();

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
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // Verify vendor ownership
  const { data: vendor } = await supabase
    .from('vendors')
    .select('owner_id')
    .eq('id', vendorId)
    .single();
  if (!vendor || vendor.owner_id !== user.id) return apiFail('FORBIDDEN', 'Not your vendor', 403);

  const parsed = await parseBody(request, outletUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

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
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: vendor } = await supabase
    .from('vendors')
    .select('owner_id')
    .eq('id', vendorId)
    .single();
  if (!vendor || vendor.owner_id !== user.id) return apiFail('FORBIDDEN', 'Not your vendor', 403);

  // Soft delete — set status to 'closed'
  const { error } = await supabase
    .from('outlets')
    .update({ status: 'closed' })
    .eq('id', outletId)
    .eq('vendor_id', vendorId);

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ id: outletId, status: 'closed' });
}

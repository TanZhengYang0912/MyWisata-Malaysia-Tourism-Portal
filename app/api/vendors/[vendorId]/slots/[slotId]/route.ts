// P2 — Member 2: Single slot PATCH/DELETE (B3)

import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { slotUpdateSchema } from '@/lib/validation/vendor-schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string; slotId: string }> }

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, slotId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;

  const parsed = await parseBody(request, slotUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (access.access.isOutletManager && body.priceOverride !== undefined) {
    return apiFail('FORBIDDEN', 'Outlet managers cannot change slot pricing', 403);
  }

  const updateData: Record<string, unknown> = {};
  if (body.capacity !== undefined) updateData.capacity = body.capacity;
  if (body.priceOverride !== undefined) updateData.price_override = body.priceOverride;
  if (body.status !== undefined) updateData.status = body.status;

  const { data, error } = await supabase
    .from('booking_slots')
    .update(updateData)
    .eq('id', slotId)
    .in('outlet_id', access.access.outletIds)
    .select()
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(data);
}

export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId, slotId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;

  // Only allow cancel if no bookings
  const { data: slot } = await supabase
    .from('booking_slots')
    .select('booked')
    .eq('id', slotId)
    .in('outlet_id', access.access.outletIds)
    .single();

  if (!slot) return apiFail('NOT_FOUND', 'Slot not found', 404);
  if (slot.booked > 0) {
    return apiFail('HAS_BOOKINGS', `Cannot cancel: ${slot.booked} booking(s) exist`, 400);
  }

  const { error } = await supabase
    .from('booking_slots')
    .update({ status: 'cancelled' })
    .eq('id', slotId)
    .in('outlet_id', access.access.outletIds);

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ id: slotId, status: 'cancelled' });
}

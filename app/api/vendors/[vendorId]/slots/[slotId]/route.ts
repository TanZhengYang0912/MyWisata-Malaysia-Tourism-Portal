// P2 — Member 2: Single slot PATCH/DELETE (B3)

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { slotUpdateSchema } from '@/lib/validation/vendor-schemas';

interface Props { params: Promise<{ vendorId: string; slotId: string }> }

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, slotId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: vendor } = await supabase
    .from('vendors')
    .select('owner_id')
    .eq('id', vendorId)
    .single();
  if (!vendor || vendor.owner_id !== user.id) return apiFail('FORBIDDEN', 'Not your vendor', 403);

  const parsed = await parseBody(request, slotUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updateData: Record<string, unknown> = {};
  if (body.capacity !== undefined) updateData.capacity = body.capacity;
  if (body.priceOverride !== undefined) updateData.price_override = body.priceOverride;
  if (body.status !== undefined) updateData.status = body.status;

  const { data, error } = await supabase
    .from('booking_slots')
    .update(updateData)
    .eq('id', slotId)
    .select()
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(data);
}

export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId, slotId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: vendor } = await supabase
    .from('vendors')
    .select('owner_id')
    .eq('id', vendorId)
    .single();
  if (!vendor || vendor.owner_id !== user.id) return apiFail('FORBIDDEN', 'Not your vendor', 403);

  // Only allow cancel if no bookings
  const { data: slot } = await supabase
    .from('booking_slots')
    .select('booked')
    .eq('id', slotId)
    .single();

  if (!slot) return apiFail('NOT_FOUND', 'Slot not found', 404);
  if (slot.booked > 0) {
    return apiFail('HAS_BOOKINGS', `Cannot cancel: ${slot.booked} booking(s) exist`, 400);
  }

  const { error } = await supabase
    .from('booking_slots')
    .update({ status: 'cancelled' })
    .eq('id', slotId);

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ id: slotId, status: 'cancelled' });
}

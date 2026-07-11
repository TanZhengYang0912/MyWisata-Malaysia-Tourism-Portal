// P2 — Member 2: Check-in booking (B4)
// POST /api/vendors/[vendorId]/bookings/[bookingId]/checkin

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';

interface Props { params: Promise<{ vendorId: string; bookingId: string }> }

export async function POST(_request: Request, { params }: Props) {
  const { vendorId, bookingId } = await params;
  const authDb = await createClient() as any;

  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // Verify vendor ownership
  const { data: vendor } = await authDb
    .from('vendors')
    .select('owner_id')
    .eq('id', vendorId)
    .single();

  if (!vendor) return apiFail('NOT_FOUND', 'Vendor not found', 404);

  const supabase = createServiceClient() as any;
  const { data: outlets } = await supabase.from('outlets').select('id').eq('vendor_id', vendorId);
  const outletIds = ((outlets as Record<string, unknown>[]) ?? []).map((outlet) => String(outlet.id));

  const isOwner = vendor.owner_id === user.id;
  if (!isOwner) {
    const { data: mgr } = await supabase
      .from('outlet_managers')
      .select('id')
      .eq('user_id', user.id)
      .in('outlet_id', outletIds.length ? outletIds : ['none'])
      .limit(1);
    if (!mgr?.length) return apiFail('FORBIDDEN', 'Not authorized', 403);
  }

  // Get booking
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, booking_slots(outlet_id)')
    .eq('id', bookingId)
    .single();

  if (!booking) return apiFail('NOT_FOUND', 'Booking not found', 404);
  if (booking.status !== 'confirmed') {
    return apiFail('INVALID_STATE', `Booking is ${booking.status}, cannot check in`, 400);
  }

  // Verify booking is for one of this vendor's outlets
  const slotOutletId = (booking.booking_slots as Record<string, unknown>)?.outlet_id as string;
  if (!outletIds.includes(slotOutletId)) {
    return apiFail('FORBIDDEN', 'Booking is not at your outlet', 403);
  }

  // Update booking
  const now = new Date().toISOString();
  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({ status: 'checked_in', check_in_at: now })
    .eq('id', bookingId);

  if (bookingErr) return apiFail('DB_ERROR', bookingErr.message, 500);

  // Also mark the corresponding order_item as fulfilled
  await supabase
    .from('order_items')
    .update({ fulfil_status: 'fulfilled', fulfilled_at: now })
    .eq('id', booking.order_item_id);

  return apiOk({ id: bookingId, status: 'checked_in', check_in_at: now });
}

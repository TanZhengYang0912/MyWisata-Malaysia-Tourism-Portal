// P2 — Member 2: Check-in booking (B4)
// POST /api/vendors/[vendorId]/bookings/[bookingId]/checkin

import { apiOk, apiFail } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';

interface Props { params: Promise<{ vendorId: string; bookingId: string }> }

export async function POST(_request: Request, { params }: Props) {
  const { vendorId, bookingId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;
  const outletIds = access.access.outletIds;

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

  void emitVendorNotification({
    eventKey: `booking:checkin:${bookingId}`,
    vendorId,
    outletId: slotOutletId,
    audience: 'owner_and_assigned_outlet',
    category: 'vendor_bookings',
    type: 'vendor_booking_checkin',
    title: 'Booking checked in',
    body: `Booking ${bookingId} was checked in at your outlet.`,
    link: `/vendor/bookings/${bookingId}`,
    email: false,
    reference: bookingId,
    metadata: { status: 'checked_in' },
    serviceDb: supabase,
  }).catch((notificationError) => console.error('[vendor-notifications] check-in event failed', notificationError));

  return apiOk({ id: bookingId, status: 'checked_in', check_in_at: now });
}

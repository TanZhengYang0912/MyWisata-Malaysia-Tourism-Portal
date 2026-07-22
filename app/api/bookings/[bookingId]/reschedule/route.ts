import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';

const schema = z.object({ slotId: z.string().uuid() }).strict();
interface Props { params: Promise<{ bookingId: string }> }

export async function POST(request: Request, { params }: Props) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const bookingId = (await params).bookingId;
  const { data, error } = await db.rpc('reschedule_booking', { p_booking_id: bookingId, p_new_slot_id: parsed.data.slotId });
  if (error) {
    if (/not_owned|auth_required/.test(error.message)) return apiFail('FORBIDDEN', 'Booking access denied', 403);
    if (/unavailable|reschedulable/.test(error.message)) return apiFail('INVALID_STATE', 'The selected slot is no longer available', 409);
    return apiFail('DB_ERROR', error.message, 500);
  }
  const service = createServiceClient();
  const { data: booking } = await service.from('bookings').select('id,order_item_id').eq('id', bookingId).maybeSingle();
  if (booking?.order_item_id) {
    const { data: item } = await service.from('order_items').select('vendor_id,outlet_id').eq('id', booking.order_item_id).maybeSingle();
    if (item?.vendor_id) {
      void emitVendorNotification({
        eventKey: `booking:reschedule:${bookingId}`,
        vendorId: item.vendor_id,
        outletId: item.outlet_id,
        audience: 'owner_and_assigned_outlet',
        category: 'vendor_bookings',
        type: 'vendor_booking_rescheduled',
        title: 'Booking rescheduled',
        body: `Booking ${bookingId} was rescheduled by the customer.`,
        link: `/vendor/bookings/${bookingId}`,
        email: false,
        reference: bookingId,
        metadata: { status: 'rescheduled' },
        serviceDb: service,
      }).catch((notificationError) => console.error('[vendor-notifications] reschedule event failed', notificationError));
    }
  }
  return apiOk(data);
}

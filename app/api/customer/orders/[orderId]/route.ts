import { authorizeOrder } from '@/lib/checkout/order-access';
import { guestPrivateResponse } from '@/lib/checkout/guest-session';
import { ORDER_SELECT, BOOKING_SELECT, mapOrder, mapBooking } from '@/backend/domains/commerce';
import { createServiceClient } from '@/lib/supabase/service';

const PUBLIC_REFUND_STATUSES = new Set(['pending', 'approved', 'processed', 'rejected', 'failed']);

export async function GET(request: Request,{params}:{params:Promise<{orderId:string}>}) {
  const {orderId}=await params;
  const access=await authorizeOrder(request,orderId);
  if (!access) return guestPrivateResponse(null,404);
  // The order is already authorized above, so the refund read can share the round trip.
  const [{data:order,error},{data:bookings,error:bookingError},{ data: refund, error: refundError }]=await Promise.all([
    access.db.from('orders').select(ORDER_SELECT).eq('id',orderId).single(),
    access.db.from('bookings').select(BOOKING_SELECT).eq('order_items.order_id',orderId),
    createServiceClient()
      .from('refunds')
      .select('status,amount,created_at,processed_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error || !order) return guestPrivateResponse(null,503);
  const refundStatus = refund ? {
    status: PUBLIC_REFUND_STATUSES.has(refund.status) ? refund.status : 'unknown',
    amount: Number(refund.amount),
    createdAt: refund.created_at,
    processedAt: refund.processed_at,
  } : null;
  return guestPrivateResponse({
    order:mapOrder(order as unknown as Parameters<typeof mapOrder>[0]),
    bookings:(bookings??[]).map(row=>mapBooking(row as unknown as Parameters<typeof mapBooking>[0])).filter(Boolean),
    bookingsUnavailable: Boolean(bookingError),
    refundStatus,
    refundStatusUnavailable: Boolean(refundError),
  });
}

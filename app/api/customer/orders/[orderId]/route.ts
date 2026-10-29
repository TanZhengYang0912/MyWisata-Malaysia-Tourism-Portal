import { authorizeOrder } from '@/lib/checkout/order-access';
import { guestPrivateResponse } from '@/lib/checkout/guest-session';
import { ORDER_SELECT, BOOKING_SELECT, mapOrder, mapBooking } from '@/backend/domains/commerce';
import { createServiceClient } from '@/lib/supabase/service';

const PUBLIC_REFUND_STATUSES = new Set(['pending', 'approved', 'processed', 'rejected', 'failed']);

export async function GET(request: Request,{params}:{params:Promise<{orderId:string}>}) {
  const {orderId}=await params;
  const access=await authorizeOrder(request,orderId);
  if (!access) return guestPrivateResponse(null,404);
  const [{data:order,error},{data:bookings,error:bookingError}]=await Promise.all([
    access.db.from('orders').select(ORDER_SELECT).eq('id',orderId).single(),
    access.db.from('bookings').select(BOOKING_SELECT).eq('order_items.order_id',orderId),
  ]);
  if (error || !order) return guestPrivateResponse(null,503);
  const { data: refund, error: refundError } = await createServiceClient()
    .from('refunds')
    .select('status,amount,created_at,processed_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
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

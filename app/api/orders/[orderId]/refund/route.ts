import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { z } from 'zod';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';

const schema = z.object({ reason: z.string().trim().min(5).max(500) }).strict();
interface Props { params: Promise<{ orderId: string }> }

export async function POST(request: Request, { params }: Props) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'A refund reason is required', 422);
  const { orderId } = await params;
  const service = createServiceClient();
  const { data: order } = await service.from('orders').select('id,total_amount,status,user_id').eq('id', orderId).eq('user_id', user.id).maybeSingle();
  if (!order) return apiFail('NOT_FOUND', 'Order not found', 404);
  if (order.status !== 'paid' && order.status !== 'completed') return apiFail('INVALID_STATE', 'Only paid orders can be refunded', 409);
  const { data: payment } = await service.from('payments').select('id,status').eq('order_id', orderId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!payment || payment.status !== 'succeeded') return apiFail('INVALID_STATE', 'A successful payment is required', 409);
  const { data, error } = await service.from('refunds').insert({ payment_id: payment.id, order_id: orderId, amount: order.total_amount, reason: parsed.data.reason, status: 'pending' }).select('id,status,amount,reason,created_at').single();
  if (error) return apiFail('DB_ERROR', error.message, 500);

  const { data: items } = await service.from('order_items').select('vendor_id,outlet_id').eq('order_id', orderId);
  for (const item of (items ?? []) as Array<{ vendor_id: string | null; outlet_id: string | null }>) {
    if (!item.vendor_id) continue;
    void emitVendorNotification({
      eventKey: `order:refund-requested:${orderId}:${data.id}`,
      vendorId: item.vendor_id,
      outletId: item.outlet_id,
      audience: 'owner_and_assigned_outlet',
      category: 'vendor_orders',
      type: 'vendor_order_refund_requested',
      title: 'Refund requested',
      body: `A customer requested a refund for order ${orderId}.`,
      link: `/vendor/orders/${orderId}`,
      email: true,
      reference: orderId,
      metadata: { reason: parsed.data.reason },
      serviceDb: service,
    }).catch((notificationError) => console.error('[vendor-notifications] refund event failed', notificationError));
  }
  return apiOk(data, { status: 201 });
}

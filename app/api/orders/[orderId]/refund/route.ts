import { authorizeOrder } from '@/lib/checkout/order-access';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { z } from 'zod';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';

const schema = z.object({ reason: z.string().trim().min(1).max(500), reasonCode: z.enum(['schedule_change','mistake','unavailable','dissatisfied','other']).optional() }).strict().superRefine((value, context) => {
  if ((!value.reasonCode && value.reason.length < 5) || (value.reasonCode === 'other' && value.reason.length < 5)) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'A detailed refund reason is required' });
  }
});
interface Props { params: Promise<{ orderId: string }> }

function vendorNoticeLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return value.replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi, '').trim() || fallback;
}


export async function POST(request: Request, { params }: Props) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'A refund reason is required', 422);
  const { orderId } = await params;
  const service = createServiceClient();
  const access = await authorizeOrder(request,orderId);
  const order = access?.order;

  if (!order) return apiFail('NOT_FOUND', 'Order not found', 404);
  if (order.status !== 'paid' && order.status !== 'completed') return apiFail('INVALID_STATE', 'Only paid orders can be refunded', 409);
  const { data, error } = parsed.data.reasonCode
    ? await service.rpc('request_order_refund_with_reason', { p_order: orderId, p_user: access.userId ?? null,
      p_guest: access.guestSubjectId ?? null, p_reason: parsed.data.reason, p_code: parsed.data.reasonCode })
    : access.guestSubjectId
    ? await service.rpc('guest_request_order_refund', {
      p_order_id: orderId,
      p_guest_subject_id: access.guestSubjectId,
      p_reason: parsed.data.reason,
    })
    : await service.rpc('request_order_refund', {
      p_order_id: orderId,
      p_user_id: access.userId,
      p_reason: parsed.data.reason,
    });
  if (error) {
    if (error.message?.includes('refund_already_active')) return apiFail('REFUND_ALREADY_REQUESTED', 'A refund is already active or completed for this order', 409);
    if (error.message?.includes('refund_payment_ambiguous')) return apiFail('INVALID_STATE', 'The successful payment could not be verified safely. Contact support before requesting a refund.', 409);
    if (error.message?.includes('refund_funding_ledger_mismatch')) return apiFail('INVALID_STATE', 'The original payment allocation could not be verified safely. Contact support before requesting a refund.', 409);
    return apiFail('DB_ERROR', 'Unable to create the refund request', 500);
  }

  const reference = vendorNoticeLabel(order.display_id, 'Order');
  const { data: items } = await service.from('order_items').select('vendor_id,outlet_id,vendors(name)').eq('order_id', orderId);
  const seen = new Set<string>();
  for (const item of (items ?? []) as Array<{ vendor_id: string | null; outlet_id: string | null; vendors?: { name: string | null } | { name: string | null }[] | null }>) {
    if (!item.vendor_id) continue;
    const scope = `${item.vendor_id}:${item.outlet_id ?? 'owner'}`;
    if (seen.has(scope)) continue;
    seen.add(scope);
    const vendor = Array.isArray(item.vendors) ? item.vendors[0] : item.vendors;
    await emitVendorNotification({
      eventKey: `order:refund-requested:${orderId}:${data.id}:${item.vendor_id}`,
      vendorId: item.vendor_id,
      outletId: item.outlet_id,
      audience: item.outlet_id ? 'owner_and_assigned_outlet' : 'owner',
      category: 'vendor_orders',
      type: 'vendor_order_refund_requested',
      title: 'Refund requested',
      body: `A customer requested a refund for ${reference}. Review the request before further fulfilment.`,
      link: '/vendor/orders',
      email: true,
      reference,
      metadata: { vendorName: vendorNoticeLabel(vendor?.name, 'Your business'), orderReference: reference },
      serviceDb: service,
    }).catch((notificationError) => console.error('[vendor-notifications] refund event failed', notificationError));
  }
  return apiOk(data, { status: 201 });
}

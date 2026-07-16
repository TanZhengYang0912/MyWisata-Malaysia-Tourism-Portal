import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { sendOrderReceiptEmail } from '@/lib/email/order-receipt';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  let body: { orderId?: string };
  try { body = await request.json(); }
  catch { return apiFail('INVALID_BODY', 'Could not parse request body', 400); }

  const { orderId } = body;
  if (!orderId) return apiFail('MISSING_ORDER_ID', 'orderId is required', 422);

  const service = createServiceClient();

  // Verify the order belongs to this user
  const { data: order } = await service
    .from('orders')
    .select('id, created_at, payment_method, subtotal, discount_amount, total_amount, voucher_code')
    .eq('id', orderId)
    .eq('user_id', user.id)
    .eq('status', 'paid')
    .single();
  if (!order) return apiFail('ORDER_NOT_FOUND', 'Order not found', 404);

  const { data: items } = await service
    .from('order_items')
    .select('product_name, variant_name, unit_price, quantity')
    .eq('order_id', orderId);

  const { data: userRow } = await service
    .from('users')
    .select('email, full_name')
    .eq('id', user.id)
    .single();

  if (!userRow?.email || !items?.length) return apiOk({ sent: false });

  try {
    await sendOrderReceiptEmail({
      recipientEmail: userRow.email,
      recipientName: userRow.full_name ?? 'there',
      orderId: order.id,
      createdAt: order.created_at,
      paymentMethod: order.payment_method ?? 'mock_card',
      items: items.map((i) => ({
        activityName: i.product_name,
        variantLabel: i.variant_name ?? 'Standard',
        unitPrice: i.unit_price,
        qty: i.quantity,
      })),
      subtotal: order.subtotal,
      discount: order.discount_amount ?? 0,
      total: order.total_amount,
      voucherCode: order.voucher_code ?? undefined,
    });
  } catch (err) {
    console.error('[api/orders/receipt] email failed:', err);
    return apiFail('EMAIL_FAILED', 'Could not send receipt email', 500);
  }

  return apiOk({ sent: true });
}

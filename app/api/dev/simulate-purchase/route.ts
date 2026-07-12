// P4 — DEV ONLY: fakes the checkout → order.paid trigger that real checkout
// doesn't fire yet (see CLAUDE.md Section 6). Deleted at merge — never imply
// a real payment happened. See CLAUDE.md Step 5.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { simulatePurchaseSchema } from '@/lib/validation/affiliate-schemas';
import { onOrderPaid } from '@/lib/affiliate/attribution';

export async function POST(request: Request) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // orders/order_items have RLS enabled with SELECT-only policies (no INSERT
  // policy exists at all — see CLAUDE.md Section 2), so this needs the
  // service-role client even though the auth check above already establishes
  // who the buyer is.
  const service = createServiceClient();

  const { data: setting } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'demo.mode')
    .maybeSingle();
  if (setting?.value !== 'true') {
    return apiFail('FORBIDDEN', 'Demo mode is disabled', 403);
  }

  const parsed = await parseBody(request, simulatePurchaseSchema);
  if (!parsed.ok) return parsed.response;
  const { productId } = parsed.data;

  const { data: product, error: productErr } = await service
    .from('products')
    .select('id, name, base_price, vendor_id, outlet_id')
    .eq('id', productId)
    .maybeSingle();
  if (productErr || !product) return apiFail('NOT_FOUND', 'Product not found', 404);

  const amount = Number(product.base_price);
  const now = new Date().toISOString();

  const { data: order, error: orderErr } = await service
    .from('orders')
    .insert({
      user_id: user.id,
      status: 'paid', // lowercase — matches the orders.status CHECK constraint
      subtotal: amount,
      discount_amount: 0,
      total_amount: amount,
      payment_method: 'mock_card',
      paid_at: now,
    })
    .select('id')
    .single();
  if (orderErr || !order) return apiFail('DB_ERROR', orderErr?.message ?? 'Unable to create order', 500);

  const { error: itemErr } = await service.from('order_items').insert({
    order_id: order.id,
    vendor_id: product.vendor_id,
    outlet_id: product.outlet_id,
    product_id: product.id,
    product_name: product.name,
    unit_price: amount,
    quantity: 1,
    line_total: amount,
  });
  if (itemErr) return apiFail('DB_ERROR', itemErr.message, 500);

  await onOrderPaid(order.id);

  return apiOk({ orderId: order.id }, { status: 201 });
}

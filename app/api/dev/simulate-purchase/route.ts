// P4 — DEV ONLY: fakes the checkout → order.paid trigger that real checkout
// doesn't fire yet (see CLAUDE.md Section 6). Deleted at merge — never imply
// a real payment happened. See CLAUDE.md Step 5.
//
// ⚠️ Now populates orders.affiliate_click_id (migration
// 019_pr_industrial_atomicity.sql, pulled in from a teammate) from the
// mw_ref cookie at order-creation time — the same thing real checkout is
// expected to do once it's wired up. This means the simulator exercises
// onOrderPaid()'s REAL path (reading the column) rather than its cookie
// fallback, so the demo actually proves the intended integration works, not
// just the compatibility shim.

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { simulatePurchaseSchema } from '@/lib/validation/affiliate-schemas';
import { onOrderPaid } from '@/lib/affiliate/attribution';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';
import { VENDOR_EVENT_MATRIX } from '@/lib/vendor-notifications/event-policy';
import { CUSTOMER_CAPABILITY, resolveCustomerCapability } from '@/lib/auth/customer-capabilities';
import { customerCapabilityFailure, resolveServerCustomerCapability } from '@/lib/auth/customer-capabilities.server';

export async function POST(request: Request) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return customerCapabilityFailure(
    CUSTOMER_CAPABILITY.CHECKOUT,
    resolveCustomerCapability(null, CUSTOMER_CAPABILITY.CHECKOUT),
    'Sign in before simulating a purchase',
  )!;

  const checkoutDecision = await resolveServerCustomerCapability(user.id, CUSTOMER_CAPABILITY.CHECKOUT);
  const checkoutFailure = customerCapabilityFailure(
    CUSTOMER_CAPABILITY.CHECKOUT,
    checkoutDecision,
    'Phone verification is required before simulating a purchase',
  );
  if (checkoutFailure) return checkoutFailure;

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

  // Look the cookie up rather than trusting it blindly — affiliate_click_id
  // has a real FK to affiliate_clicks(id), so a stale/forged cookie value
  // would otherwise fail the whole order insert instead of just silently
  // not attributing (which is how onOrderPaid() itself treats an unknown
  // click id).
  const cookieStore = await cookies();
  const mwRefCookie = cookieStore.get('mw_ref')?.value ?? null;
  let affiliateClickId: string | null = null;
  if (mwRefCookie) {
    const { data: existingClick } = await service.from('affiliate_clicks').select('id').eq('id', mwRefCookie).maybeSingle();
    affiliateClickId = existingClick?.id ?? null;
  }

  const { data: order, error: orderErr } = await service.rpc('create_demo_purchase', {
    p_user_id: user.id,
    p_product_id: product.id,
    p_affiliate_click_id: affiliateClickId,
  });
  if (orderErr || !order || typeof order !== 'object' || typeof order.order_id !== 'string') {
    return apiFail('DB_ERROR', orderErr?.message ?? 'Unable to create order', 500);
  }
  const orderId = order.order_id;

  await onOrderPaid(orderId);

  // The order is persisted before the vendor feed is touched. Notification
  // failure must not make the completed demo purchase look unsuccessful.
  void emitVendorNotification({
    eventKey: `order:paid:${orderId}`,
    vendorId: product.vendor_id,
    outletId: product.outlet_id,
    audience: VENDOR_EVENT_MATRIX.newOrder.audience,
    category: VENDOR_EVENT_MATRIX.newOrder.category,
    type: 'vendor_order_created',
    title: 'New order received',
    body: `A new order for ${product.name} is ready for fulfilment.`,
    link: `/vendor/orders/${orderId}`,
    email: VENDOR_EVENT_MATRIX.newOrder.email,
    reference: orderId,
    metadata: { amount: Number(amount.toFixed(2)), vendorName: 'Vendor' },
    serviceDb: service,
  }).catch((error) => console.error('[vendor-notifications] order event failed', error));

  return apiOk({ orderId }, { status: 201 });
}

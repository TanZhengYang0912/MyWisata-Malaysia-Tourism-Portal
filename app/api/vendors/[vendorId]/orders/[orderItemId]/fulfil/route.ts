// P2 — Member 2: Fulfil order item (B4)
// POST /api/vendors/[vendorId]/orders/[orderItemId]/fulfil
// Updates fulfil_status: pending → ready → fulfilled

import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { fulfilSchema } from '@/lib/validation/vendor-schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';
import { canUseGenericFoodFulfilment } from '@/lib/food/generic-fulfil-policy';

interface Props { params: Promise<{ vendorId: string; orderItemId: string }> }

export async function POST(request: Request, { params }: Props) {
  const { vendorId, orderItemId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;
  const outletIds = access.access.outletIds;

  const parsed = await parseBody(request, fulfilSchema);
  if (!parsed.ok) return parsed.response;
  const { status: newStatus } = parsed.data;
  // Get current order item
  const { data: item } = await supabase
    .from('order_items')
    .select('*, orders(status), products(categories(slug))')
    .eq('id', orderItemId)
    .in('outlet_id', outletIds)
    .single();

  if (!item) return apiFail('NOT_FOUND', 'Order item not found or not in your outlets', 404);

  const product = Array.isArray(item.products) ? item.products[0] : item.products;
  const category = Array.isArray(product?.categories) ? product.categories[0] : product?.categories;
  if (newStatus === 'fulfilled' && !canUseGenericFoodFulfilment({
    categorySlug: category?.slug,
    scannedAt: item.food_qr_scanned_at,
  })) {
    return apiFail('FOOD_QR_REQUIRED', 'Food orders must be scanned at the correct outlet before fulfilment', 409);
  }

  // Validate state transition
  const order = item.orders as Record<string, unknown>;
  if (order?.status !== 'paid' && order?.status !== 'completed') {
    return apiFail('INVALID_STATE', 'Order must be paid before fulfilling items', 400);
  }

  if (newStatus === 'ready' && item.fulfil_status !== 'pending') {
    return apiFail('INVALID_STATE', `Cannot mark ready: current status is ${item.fulfil_status}`, 400);
  }
  if (newStatus === 'fulfilled' && item.fulfil_status !== 'pending' && item.fulfil_status !== 'ready') {
    return apiFail('INVALID_STATE', `Cannot fulfil: current status is ${item.fulfil_status}`, 400);
  }

  const updateData: Record<string, unknown> = { fulfil_status: newStatus };
  if (newStatus === 'fulfilled') {
    updateData.fulfilled_at = new Date().toISOString();
  }

  const allowedCurrentStatuses = newStatus === 'ready' ? ['pending'] : ['pending', 'ready'];
  const { data: updated, error } = await supabase
    .from('order_items')
    .update(updateData)
    .eq('id', orderItemId)
    .eq('vendor_id', vendorId)
    .in('outlet_id', outletIds)
    .in('fulfil_status', allowedCurrentStatuses)
    .select('id')
    .maybeSingle();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (!updated) return apiFail('INVALID_STATE', 'This order item changed. Refresh and try again.', 409);

  void emitVendorNotification({
    eventKey: `order:fulfil:${orderItemId}:${newStatus}`,
    vendorId,
    outletId: item.outlet_id,
    audience: 'owner_and_assigned_outlet',
    category: 'vendor_orders',
    type: 'vendor_order_updated',
    title: `Order marked ${newStatus}`,
    body: `Order ${item.order_id} was marked ${newStatus}.`,
    link: `/vendor/orders/${item.order_id}`,
    email: true,
    reference: item.order_id,
    metadata: { status: newStatus },
    serviceDb: supabase,
  }).catch((notificationError) => console.error('[vendor-notifications] fulfil event failed', notificationError));

  // Check if all items in this order are fulfilled — if so, suggest completing
  const { data: allItems } = await supabase
    .from('order_items')
    .select('fulfil_status')
    .eq('order_id', item.order_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allFulfilled = (allItems ?? []).every((i: any) => i.fulfil_status === 'fulfilled');

  return apiOk({
    id: orderItemId,
    fulfilStatus: newStatus,
    allItemsFulfilled: allFulfilled,
    orderId: item.order_id,
  });
}

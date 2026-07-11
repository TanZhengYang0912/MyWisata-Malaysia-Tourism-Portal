// P2 — Member 2: Fulfil order item (B4)
// POST /api/vendors/[vendorId]/orders/[orderItemId]/fulfil
// Updates fulfil_status: pending → ready → fulfilled

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { fulfilSchema } from '@/lib/validation/vendor-schemas';

interface Props { params: Promise<{ vendorId: string; orderItemId: string }> }

export async function POST(request: Request, { params }: Props) {
  const { vendorId, orderItemId } = await params;
  const authDb = await createClient() as any;

  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // Verify vendor ownership or outlet manager
  const { data: vendor } = await authDb
    .from('vendors')
    .select('owner_id')
    .eq('id', vendorId)
    .single();

  if (!vendor) return apiFail('NOT_FOUND', 'Vendor not found', 404);

  const supabase = createServiceClient() as any;
  const { data: outlets } = await supabase.from('outlets').select('id').eq('vendor_id', vendorId);
  const outletIds = ((outlets as Record<string, unknown>[]) ?? []).map((outlet) => String(outlet.id));

  // Check ownership: vendor owner OR outlet manager for this outlet
  const isOwner = vendor.owner_id === user.id;
  if (!isOwner) {
    const { data: mgr } = await supabase
      .from('outlet_managers')
      .select('id')
      .eq('user_id', user.id)
      .in('outlet_id', outletIds.length ? outletIds : ['none'])
      .limit(1);
    if (!mgr?.length) return apiFail('FORBIDDEN', 'Not authorized for this vendor', 403);
  }

  const parsed = await parseBody(request, fulfilSchema);
  if (!parsed.ok) return parsed.response;
  const { status: newStatus } = parsed.data;
  // Get current order item
  const { data: item } = await supabase
    .from('order_items')
    .select('*, orders(status)')
    .eq('id', orderItemId)
    .in('outlet_id', outletIds)
    .single();

  if (!item) return apiFail('NOT_FOUND', 'Order item not found or not in your outlets', 404);

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

  const { error } = await supabase
    .from('order_items')
    .update(updateData)
    .eq('id', orderItemId);

  if (error) return apiFail('DB_ERROR', error.message, 500);

  // Check if all items in this order are fulfilled — if so, suggest completing
  const { data: allItems } = await supabase
    .from('order_items')
    .select('fulfil_status')
    .eq('order_id', item.order_id);

  const allFulfilled = (allItems ?? []).every((i: any) => i.fulfil_status === 'fulfilled');

  return apiOk({
    id: orderItemId,
    fulfilStatus: newStatus,
    allItemsFulfilled: allFulfilled,
    orderId: item.order_id,
  });
}

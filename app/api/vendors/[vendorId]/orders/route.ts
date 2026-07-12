// P2 — Member 2: Vendor order items view (B4)
// GET /api/vendors/[vendorId]/orders

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { outletShortName } from '@/lib/outlet-display';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string }> }

export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const authDb = await createClient() as any;
  const url = new URL(request.url);
  const fulfilStatus = url.searchParams.get('fulfil_status');
  const orderStatus = url.searchParams.get('order_status');
  const rawQ = (url.searchParams.get('q') || '').trim();
  const q = rawQ.replace(/[%(),]/g, ' ');
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '10', 10) || 10));
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = access.access.serviceDb;

  // Get vendor outlets
  const outletIds = access.access.outletIds;

  if (!outletIds.length) return apiOk({ items: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });

  let query = supabase
    .from('orders')
    .select(`
      id, display_id, user_id, status, paid_at, completed_at, created_at,
      users(full_name, email),
      order_items!inner(
        id, order_id, product_name, variant_name, slot_starts_at, quantity, line_total, fulfil_status, created_at, vendor_id,
        outlets(id, name, city, state),
        products(cover_url)
      )
    `, { count: 'exact' })
    .eq('order_items.vendor_id', vendorId)
    .in('order_items.outlet_id', outletIds)
    .order('created_at', { ascending: false });

  if (fulfilStatus) query = query.eq('order_items.fulfil_status', fulfilStatus);
  if (orderStatus && orderStatus !== 'all') query = query.eq('status', orderStatus);
  if (q) {
    const [{ data: vendorItems }, { data: matchingUsers }, { data: matchingOrders }] = await Promise.all([
      supabase.from('order_items').select('id,order_id,product_name,variant_name').eq('vendor_id', vendorId).limit(10000),
      supabase.from('users').select('id').or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(100),
      supabase.from('orders').select('id').ilike('display_id', `%${q}%`).limit(100)
    ]);
    const searchTerm = rawQ.toLowerCase();
    const matchingOrderIds = [
      ...(vendorItems || []).filter((item: any) => String(item.product_name || '').toLowerCase().includes(searchTerm) || String(item.variant_name || '').toLowerCase().includes(searchTerm)).map((item: any) => item.order_id),
      ...(matchingOrders || []).map((item: any) => item.id)
    ];
    const userIds = (matchingUsers || []).map((item: any) => item.id);
    if (userIds.length) {
      const { data: userOrders } = await supabase.from('orders').select('id').in('user_id', userIds).limit(10000);
      matchingOrderIds.push(...(userOrders || []).map((item: any) => item.id));
    }
    const conditions = [];
    if (matchingOrderIds.length) conditions.push(`id.in.(${[...new Set(matchingOrderIds)].join(',')})`);
    if (!conditions.length) return apiOk({ items: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });
    query = query.or(conditions.join(','));
  }
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return apiFail('DB_ERROR', error.message, 500);

  const items = (data ?? []).map((order: any) => {
    // Ensure we only process this vendor's items
    const vendorItems = (order.order_items || []).filter((i: any) => i.vendor_id === vendorId);
    const total = vendorItems.reduce((sum: number, item: any) => sum + Number(item.line_total || 0), 0);
    const uniqueOutlets = [...new Set(vendorItems.map((item: any) => item.outlets?.name ? outletShortName(item.outlets.name) : null).filter(Boolean))];

    let fulfil_status = 'pending';
    if (vendorItems.length > 0) {
      if (vendorItems.every((item: any) => item.fulfil_status === 'fulfilled')) fulfil_status = 'fulfilled';
      else if (vendorItems.every((item: any) => item.fulfil_status === 'cancelled')) fulfil_status = 'cancelled';
      else if (vendorItems.every((item: any) => item.fulfil_status === 'ready' || item.fulfil_status === 'fulfilled')) fulfil_status = 'ready';
    }

    return {
      ...order,
      vendor_total: total,
      vendor_items: vendorItems,
      outlets_summary: uniqueOutlets.length > 1 ? 'Multiple outlets' : (uniqueOutlets[0] || 'Unknown outlet'),
      vendor_fulfil_status: fulfil_status,
      // Provide a product summary string
      product_summary: vendorItems.map((i: any) => `${i.quantity}x ${i.product_name}`).join(', ')
    };
  });

  return apiOk({ items, pagination: { page, pageSize, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)) } });
}

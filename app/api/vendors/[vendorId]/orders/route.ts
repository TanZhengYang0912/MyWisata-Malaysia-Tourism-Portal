// P2 — Member 2: Vendor order items view (B4)
// GET /api/vendors/[vendorId]/orders

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';

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

  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: vendor } = await authDb
    .from('vendors')
    .select('owner_id, status')
    .eq('id', vendorId)
    .maybeSingle();
  if (!vendor || vendor.owner_id !== user.id || vendor.status !== 'approved') {
    return apiFail('FORBIDDEN', 'You cannot view this vendor orders list', 403);
  }

  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = createServiceClient() as any;

  // Get vendor outlets
  const { data: outlets } = await supabase
    .from('outlets')
    .select('id')
    .eq('vendor_id', vendorId);
  const outletIds = (outlets ?? []).map((o: any) => o.id);

  if (!outletIds.length) return apiOk({ items: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });

  let query = supabase
    .from('order_items')
    .select(`
      *,
      orders!inner(id, user_id, status, paid_at, completed_at, created_at,
        users(full_name, email)
      ),
      outlets(name, city, state),
      products(cover_url)
    `, { count: 'exact' })
    .in('outlet_id', outletIds)
    .order('created_at', { ascending: false });

  if (fulfilStatus) query = query.eq('fulfil_status', fulfilStatus);
  if (orderStatus && orderStatus !== 'all') query = query.eq('orders.status', orderStatus);
  if (q) {
    const [{ data: vendorItems }, { data: matchingUsers }] = await Promise.all([
      supabase.from('order_items').select('id,order_id,product_name,variant_name').eq('vendor_id', vendorId).limit(10000),
      supabase.from('users').select('id').or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(100),
    ]);
    const searchTerm = rawQ.toLowerCase();
    const matchingItemIds = (vendorItems || []).filter((item: any) => [item.id, item.order_id, item.product_name, item.variant_name].some((value) => String(value || '').toLowerCase().includes(searchTerm))).map((item: any) => item.id);
    const matchingOrderIds = (vendorItems || []).filter((item: any) => String(item.order_id || '').toLowerCase().includes(searchTerm)).map((item: any) => item.order_id);
    const userIds = (matchingUsers || []).map((item: any) => item.id);
    if (userIds.length) {
      const { data: userOrders } = await supabase.from('orders').select('id').in('user_id', userIds).limit(10000);
      matchingOrderIds.push(...(userOrders || []).map((item: any) => item.id));
    }
    const conditions = [];
    if (matchingItemIds.length) conditions.push(`id.in.(${[...new Set(matchingItemIds)].join(',')})`);
    if (matchingOrderIds.length) conditions.push(`order_id.in.(${[...new Set(matchingOrderIds)].join(',')})`);
    if (!conditions.length) return apiOk({ items: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });
    query = query.or(conditions.join(','));
  }
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ items: data ?? [], pagination: { page, pageSize, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)) } });
}

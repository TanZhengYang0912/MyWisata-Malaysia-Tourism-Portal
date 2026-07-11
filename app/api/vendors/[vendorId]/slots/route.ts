// P2 — Member 2: Booking slot CRUD (B3)

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { slotCreateSchema } from '@/lib/validation/vendor-schemas';

interface Props { params: Promise<{ vendorId: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { vendorId } = await params;
  const authDb = await createClient() as any;
  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: vendor } = await authDb.from('vendors').select('owner_id,status').eq('id', vendorId).maybeSingle();
  if (!vendor || vendor.owner_id !== user.id || vendor.status !== 'approved') return apiFail('FORBIDDEN', 'You cannot view this vendor slots list', 403);
  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = createServiceClient() as any;
  const request = _request;
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '10', 10) || 10));
  const q = (url.searchParams.get('q') || '').trim().replace(/[%(),]/g, ' ');
  const status = url.searchParams.get('status');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  // Get vendor outlets
  const { data: outlets } = await supabase
    .from('outlets')
    .select('id')
    .eq('vendor_id', vendorId);
  const outletIds = (outlets ?? []).map((o: any) => o.id);

  let query = supabase
    .from('booking_slots')
    .select('id,product_id,outlet_id,starts_at,ends_at,capacity,booked,price_override,status,products(name,base_price,cover_url),outlets(name,city,state)', { count: 'exact' })
    .in('outlet_id', outletIds.length ? outletIds : ['none']);
  if (status && status !== 'all') query = query.eq('status', status);
  if (from) query = query.gte('starts_at', from);
  if (to) query = query.lte('starts_at', to);
  if (q) {
    const [{ data: productMatches }, { data: outletMatches }] = await Promise.all([
      supabase.from('products').select('id').eq('vendor_id', vendorId).or(`name.ilike.%${q}%,slug.ilike.%${q}%`).limit(100),
      supabase.from('outlets').select('id').eq('vendor_id', vendorId).or(`name.ilike.%${q}%,city.ilike.%${q}%`).limit(100),
    ]);
    const conditions = [
      ...((productMatches || []).map((item: any) => `product_id.eq.${item.id}`)),
      ...((outletMatches || []).map((item: any) => `outlet_id.eq.${item.id}`)),
    ];
    if (!conditions.length) return apiOk({ items: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });
    query = query.or(conditions.join(','));
  }
  const { data, error, count } = await query.order('starts_at').range((page - 1) * pageSize, page * pageSize - 1);

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ items: data ?? [], pagination: { page, pageSize, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)) } });
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: vendor } = await supabase
    .from('vendors')
    .select('owner_id')
    .eq('id', vendorId)
    .single();
  if (!vendor || vendor.owner_id !== user.id) return apiFail('FORBIDDEN', 'Not your vendor', 403);

  const parsed = await parseBody(request, slotCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Verify product requires booking and belongs to vendor
  const { data: product } = await supabase
    .from('products')
    .select('id, requires_booking')
    .eq('id', body.productId)
    .eq('vendor_id', vendorId)
    .single();
  if (!product) return apiFail('NOT_FOUND', 'Product not found', 404);
  if (!product.requires_booking) {
    return apiFail('INVALID_PRODUCT', 'Product does not require booking — create inventory instead', 400);
  }

  // Verify outlet belongs to vendor
  const { data: outlet } = await supabase
    .from('outlets')
    .select('id')
    .eq('id', body.outletId)
    .eq('vendor_id', vendorId)
    .single();
  if (!outlet) return apiFail('INVALID_OUTLET', 'Outlet not found or not owned by this vendor', 400);

  const { data, error } = await supabase.from('booking_slots').insert({
    product_id: body.productId,
    outlet_id: body.outletId,
    starts_at: body.startsAt,
    ends_at: body.endsAt,
    capacity: body.capacity,
    booked: 0,
    price_override: body.priceOverride ?? null,
    status: 'available',
  }).select().single();

  if (error) return apiFail('DB_ERROR', error.message, 400);
  return apiOk(data, { status: 201 });
}

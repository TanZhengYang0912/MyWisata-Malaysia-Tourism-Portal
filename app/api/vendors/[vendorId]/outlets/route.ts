// P2 — Member 2: Outlet CRUD (B2)
// GET /api/vendors/[vendorId]/outlets — list outlets
// POST /api/vendors/[vendorId]/outlets — create outlet

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { outletCreateSchema } from '@/lib/validation/vendor-schemas';
import { slugify } from '@/lib/utils';

interface Props { params: Promise<{ vendorId: string }> }

export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const authDb = await createClient() as any;
  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: vendor } = await authDb.from('vendors').select('id,owner_id,status').eq('id', vendorId).maybeSingle();
  if (!vendor || vendor.owner_id !== user.id || vendor.status !== 'approved') return apiFail('FORBIDDEN', 'You cannot view this vendor outlets list', 403);
  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = createServiceClient() as any;
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(24, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '10', 10) || 10));
  const q = url.searchParams.get('q')?.trim() || '';
  const state = url.searchParams.get('state');
  const status = url.searchParams.get('status');
  const sort = url.searchParams.get('sort') || 'newest';

  let query = supabase
    .from('outlets')
    .select('id,name,slug,address,city,state,postcode,country,lat,lng,phone,email,operating_hours,status,created_at,outlet_pages(hero_url,brand_colour),products(count)', { count: 'exact' })
    .eq('vendor_id', vendorId)
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (q) {
    const safeQ = q.replace(/[%(),]/g, ' ');
    const uuidQ = /^[0-9a-f-]{36}$/i.test(q);
    query = uuidQ ? query.or(`id.eq.${q},name.ilike.%${safeQ}%,city.ilike.%${safeQ}%`) : query.or(`name.ilike.%${safeQ}%,city.ilike.%${safeQ}%`);
  }
  if (state) query = query.eq('state', state);
  if (status) query = query.eq('status', status);
  query = query.order(sort === 'name' ? 'name' : 'created_at', { ascending: sort === 'name' });

  const [{ data, error, count }, { data: stateRows, error: stateError }] = await Promise.all([
    query,
    supabase.from('outlets').select('state').eq('vendor_id', vendorId).not('state', 'is', null).order('state'),
  ]);
  if (error || stateError) return apiFail('DB_ERROR', (error || stateError).message, 500);
  const items = (data ?? []).map((outlet: any) => {
    const outletPage = Array.isArray(outlet.outlet_pages) ? outlet.outlet_pages[0] : outlet.outlet_pages;
    return { ...outlet, coverUrl: outletPage?.hero_url || null, productsCount: outlet.products?.[0]?.count ?? 0 };
  });
  return apiOk({ items, availableStates: [...new Set((stateRows || []).map((row: any) => row.state))], pagination: { page, pageSize, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)) } });
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // Verify vendor ownership
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, owner_id, status')
    .eq('id', vendorId)
    .single();

  if (!vendor) return apiFail('NOT_FOUND', 'Vendor not found', 404);
  if (vendor.owner_id !== user.id) return apiFail('FORBIDDEN', 'Not your vendor', 403);
  if (vendor.status !== 'approved') return apiFail('INVALID_STATE', 'Vendor not approved', 400);

  const parsed = await parseBody(request, outletCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const finalSlug = body.slug || slugify(`${body.name}-${body.city || 'outlet'}`);

  const { data, error } = await supabase.from('outlets').insert({
    vendor_id: vendorId,
    name: body.name,
    slug: finalSlug,
    address: body.address ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    postcode: body.postcode ?? null,
    country: body.country ?? 'Malaysia',
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    phone: body.phone ?? null,
    email: body.email || null,
    operating_hours: body.operatingHours ?? null,
  }).select().single();

  if (error) return apiFail('DB_ERROR', error.message, 400);
  return apiOk(data, { status: 201 });
}

// P2 — Member 2: Product CRUD (B2)
// GET /api/vendors/[vendorId]/products — list products
// POST /api/vendors/[vendorId]/products — create product + default variant

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { productCreateSchema } from '@/lib/validation/vendor-schemas';
import { slugify } from '@/lib/utils';

interface Props { params: Promise<{ vendorId: string }> }

export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const authDb = await createClient() as any;
  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: vendor } = await authDb.from('vendors').select('id,owner_id,status').eq('id', vendorId).maybeSingle();
  if (!vendor || vendor.owner_id !== user.id || vendor.status !== 'approved') return apiFail('FORBIDDEN', 'You cannot view this vendor catalogue', 403);
  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = createServiceClient() as any;
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(24, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '10', 10) || 10));
  const outletId = url.searchParams.get('outlet_id');
  const categoryId = url.searchParams.get('category_id');
  const status = url.searchParams.get('status');
  const productType = url.searchParams.get('product_type');
  const q = url.searchParams.get('q')?.trim() || '';
  const sort = url.searchParams.get('sort') || 'newest';

  let query = supabase
    .from('products')
    .select('id,name,slug,description,product_type,requires_booking,base_price,cover_url,status,outlet_id,created_at,tags,outlets(name,city,state),product_variants(id,name,price_offset,is_default,is_active,inventory(quantity,reserved))', { count: 'exact' })
    .eq('vendor_id', vendorId)
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (outletId) query = query.eq('outlet_id', outletId);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (status) query = query.eq('status', status);
  if (productType) query = query.eq('product_type', productType);
  if (q) {
    const safeQ = q.replace(/[%(),]/g, ' ');
    const uuidQ = /^[0-9a-f-]{36}$/i.test(q);
    query = uuidQ ? query.or(`id.eq.${q},name.ilike.%${safeQ}%,slug.ilike.%${safeQ}%`) : query.or(`name.ilike.%${safeQ}%,slug.ilike.%${safeQ}%`);
  }
  query = query.order(sort === 'name' ? 'name' : sort === 'price_low' ? 'base_price' : 'created_at', { ascending: sort === 'name' || sort === 'price_low' });

  const { data, error, count } = await query;
  if (error) return apiFail('DB_ERROR', error.message, 500);
  const items = (data ?? []).map((product: any) => ({
    ...product,
    outlet: product.outlets,
    variants: product.product_variants ?? [],
    availableStock: (product.product_variants ?? []).reduce((total: number, variant: any) => total + Number(variant.inventory?.[0]?.quantity ?? 0), 0),
  }));
  return apiOk({ items, pagination: { page, pageSize, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)) } });
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

  const parsed = await parseBody(request, productCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Verify outlet belongs to vendor
  const { data: outlet } = await supabase
    .from('outlets')
    .select('id')
    .eq('id', body.outletId)
    .eq('vendor_id', vendorId)
    .single();
  if (!outlet) return apiFail('INVALID_OUTLET', 'Outlet not found or not owned by this vendor', 400);

  const finalSlug = body.slug || slugify(body.name);

  // Create product
  const { data: product, error: prodErr } = await supabase.from('products').insert({
    vendor_id: vendorId,
    outlet_id: body.outletId,
    category_id: body.categoryId ?? null,
    name: body.name,
    slug: finalSlug,
    description: body.description ?? null,
    product_type: body.productType,
    requires_booking: body.requiresBooking,
    base_price: body.basePrice,
    cover_url: body.coverUrl || null,
    tags: body.tags ?? null,
    status: 'active',
  }).select().single();

  if (prodErr) return apiFail('DB_ERROR', prodErr.message, 400);

  // Auto-create default variant "Standard"
  const { data: variant } = await supabase.from('product_variants').insert({
    product_id: product!.id,
    name: 'Standard',
    price_offset: 0,
    is_default: true,
  }).select().single();

  // If not a booking product, create inventory
  if (!body.requiresBooking && variant) {
    await supabase.from('inventory').insert({
      variant_id: variant.id,
      quantity: 0,
      reserved: 0,
    });
  }

  return apiOk(product, { status: 201 });
}

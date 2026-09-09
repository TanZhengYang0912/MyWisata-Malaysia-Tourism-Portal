// P2 — Member 2: Product CRUD (B2)
// GET /api/vendors/[vendorId]/products — list products
// POST /api/vendors/[vendorId]/products — create product + default variant

import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { productCreateSchema } from '@/lib/validation/vendor-schemas';
import { slugify } from '@/lib/utils';
import { outletShortName } from '@/lib/outlet-display';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { filterProductsByOutlet, resolveProductOutlet, type ProductOutletCandidate } from '@/lib/vendor/product-scope';
import { getOutletProductIds } from '@/backend/domains/catalogue';

interface Props { params: Promise<{ vendorId: string }> }

export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(24, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '10', 10) || 10));
  const metadataOnly = url.searchParams.get('view') === 'booking_metadata';
  const outletId = url.searchParams.get('outlet_id');
  const categoryId = url.searchParams.get('category_id');
  const status = url.searchParams.get('status');
  const productType = url.searchParams.get('product_type');
  const q = url.searchParams.get('q')?.trim() || '';
  const sort = url.searchParams.get('sort') || 'newest';

  const selection = metadataOnly
    ? 'id,name,requires_booking,status,outlet_id,outlets(id,name),outlet_offers(outlet_id,status,outlets(id,name))'
    : 'id,display_id,name,slug,description,product_type,requires_booking,base_price,cover_url,status,review_status,review_note,category_id,outlet_id,created_at,tags,default_capacity,digital_asset_url,digital_asset_name,digital_asset_type,digital_asset_size,media_assets(id,url,alt_text,sort_order),outlets(id,display_id,name,city,state),outlet_offers(outlet_id,status,price,outlets(id,display_id,name,city,state)),product_variants(id,name,price_offset,is_default,is_active,inventory(quantity,reserved,low_stock_threshold))';
  let query = supabase
    .from('products')
    .select(selection, { count: 'exact' })
    .eq('vendor_id', vendorId)
    .range((page - 1) * pageSize, page * pageSize - 1);

  // Products became vendor-level records when outlet offers were introduced.
  // Keep direct outlet products and shared products in the same vendor view;
  // resolveProductOutlet below enforces the caller's outlet scope for shared
  // rows after their offers have been loaded.
  if (outletId) {
    if (!access.access.outletIds.includes(outletId)) {
      return apiFail('FORBIDDEN', 'This outlet is outside your assigned scope', 403);
    }
    let outletProductIds: Set<string>;
    try {
      outletProductIds = await getOutletProductIds(supabase, outletId);
    } catch (error) {
      return apiFail('DB_ERROR', error instanceof Error ? error.message : 'Unable to verify outlet products', 500);
    }
    if (!outletProductIds.size) {
      return apiOk({ items: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });
    }
    query = query.in('id', [...outletProductIds]);
  } else {
    query = access.access.outletIds.length
      ? query.or(`outlet_id.in.(${access.access.outletIds.join(',')}),outlet_id.is.null`)
      : query.eq('outlet_id', 'none');
  }
  if (categoryId) query = query.eq('category_id', categoryId);
  if (status) query = query.eq('status', status);
  if (productType) query = query.eq('product_type', productType);
  if (q) {
    const safeQ = q.replace(/[%(),]/g, ' ');
    // We now have a true database display_id, so we can natively search it!
    query = query.or(`display_id.ilike.%${safeQ}%,name.ilike.%${safeQ}%,slug.ilike.%${safeQ}%`);
  }
  query = query.order(sort === 'name' ? 'name' : sort === 'price_low' ? 'base_price' : 'created_at', { ascending: sort === 'name' || sort === 'price_low' });

  const { data, error, count } = await query;
  if (error) return apiFail('DB_ERROR', error.message, 500);
  const productRows = (data ?? []) as unknown as ProductOutletCandidate[];
  const scopedProducts = outletId
    ? filterProductsByOutlet(productRows, outletId)
    : productRows;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = scopedProducts.flatMap((product: any) => {
    const allowedOutletIds = new Set(outletId ? [outletId] : access.access.outletIds);
    const scopedOffers = (product.outlet_offers ?? []).filter(
      (offer: { outlet_id: string }) => allowedOutletIds.has(offer.outlet_id),
    );
    const scopedProduct = { ...product, outlet_offers: scopedOffers };
    const resolvedOutlet = resolveProductOutlet(scopedProduct, [...allowedOutletIds]);
    if (!resolvedOutlet) return [];
    if (metadataOnly) {
      return [{
        id: product.id,
        name: product.name,
        outlet_id: resolvedOutlet.id,
        status: product.status,
        requires_booking: product.requires_booking,
      }];
    }
    const outlet = outletId ? resolvedOutlet : product.outlets || resolvedOutlet;
    return [{
      ...product,
      outlet_offers: scopedOffers,
      outlet_id: product.outlet_id || resolvedOutlet.id,
      outlet: { ...outlet, full_name: outlet.name, name: outletShortName(outlet.name) },
      variants: product.product_variants ?? [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      availableStock: (product.product_variants ?? []).reduce((total: number, variant: any) => total + Math.max(0, Number(variant.inventory?.[0]?.quantity ?? 0) - Number(variant.inventory?.[0]?.reserved ?? 0)), 0),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lowStockThreshold: (product.product_variants ?? []).reduce((threshold: number, variant: any) => Math.max(threshold, Number(variant.inventory?.[0]?.low_stock_threshold ?? 5)), 0),
    }];
  });
  return apiOk({ items, pagination: { page, pageSize, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)) } });
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;

  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, owner_id, status')
    .eq('id', vendorId)
    .single();

  if (!vendor) return apiFail('NOT_FOUND', 'Vendor not found', 404);
  if (!['pending', 'rejected', 'approved'].includes(vendor.status)) return apiFail('INVALID_STATE', 'Vendor is not available for draft setup', 400);

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
  if (!access.access.outletIds.includes(body.outletId)) {
    return apiFail('FORBIDDEN', 'This outlet is outside your assigned scope', 403);
  }

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
    status: 'inactive',
    review_status: body.submissionMode === 'draft' ? 'draft' : 'pending_review',
    default_capacity: body.defaultCapacity ?? null,
    digital_asset_url: body.digitalAssetUrl || null,
    digital_asset_name: body.digitalAssetName || null,
    digital_asset_type: body.digitalAssetType || null,
    digital_asset_size: body.digitalAssetSize ?? null,
  }).select().single();

  if (prodErr) return apiFail('DB_ERROR', prodErr.message, 400);

  if (body.gallery?.length) {
    const { error: mediaError } = await supabase.from('media_assets').insert(body.gallery.map((media, index) => ({
      vendor_id: vendorId,
      outlet_id: body.outletId,
      product_id: product!.id,
      url: media.url,
      alt_text: media.alt || body.name,
      media_type: 'image',
      sort_order: index,
    })));
    if (mediaError) return apiFail('DB_ERROR', mediaError.message, 500);
  }

  // Auto-create default variant "Standard"
  const { data: variant } = await supabase.from('product_variants').insert({
    product_id: product!.id,
    name: 'Standard',
    price_offset: 0,
    is_default: true,
  }).select().single();

  // Stock-backed products start with the explicitly configured quantity. A
  // digital product is file-backed and does not need a finite inventory row.
  if (!body.requiresBooking && body.productType !== 'digital' && variant) {
    await supabase.from('inventory').insert({
      variant_id: variant.id,
      outlet_id: body.outletId,
      quantity: body.availableStock ?? 0,
      reserved: 0,
      low_stock_threshold: body.lowStockThreshold ?? 5,
    });
  }

  return apiOk(product, { status: 201 });
}

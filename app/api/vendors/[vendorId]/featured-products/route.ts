import { apiOk, apiFail } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props {
  params: Promise<{ vendorId: string }>;
}

export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;

  // 1. Check vendors table for featured_product_ids
  let featuredProductIds: string[] = [];
  try {
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id, featured_product_ids')
      .eq('id', vendorId)
      .maybeSingle();

    const vendorRecord = vendor as { featured_product_ids?: string[] | null } | null;
    if (vendorRecord && Array.isArray(vendorRecord.featured_product_ids) && vendorRecord.featured_product_ids.length > 0) {
      featuredProductIds = vendorRecord.featured_product_ids;
    }
  } catch {
    // Column might not exist yet, fallback
  }

  // 2. If empty, check products with 'featured' in tags
  if (featuredProductIds.length === 0) {
    const { data: taggedProducts } = await supabase
      .from('products')
      .select('id')
      .eq('vendor_id', vendorId)
      .contains('tags', ['featured'])
      .limit(4);

    if (taggedProducts && taggedProducts.length > 0) {
      featuredProductIds = taggedProducts.map((p) => p.id);
    }
  }

  // 3. Fetch product details if any are featured
  let products: unknown[] = [];
  if (featuredProductIds.length > 0) {
    const { data: productRows } = await supabase
      .from('products')
      .select('id, display_id, name, slug, cover_url, base_price, product_type, status, outlet_id, outlets(id, name), outlet_offers(outlet_id, outlets(id, name))')
      .in('id', featuredProductIds);

    const metricsData = (await supabase
      .from('product_review_metrics')
      .select('product_id, rating, reviews')
      .in('product_id', featuredProductIds)).data ?? [];

    const metricsMap = new Map((metricsData as Array<{ product_id: string; rating: number | string; reviews: number | string }>).map((m) => [m.product_id, { rating: Number(m.rating) || 0, reviews: Number(m.reviews) || 0 }]));

    const productMap = new Map((productRows ?? []).map((p) => [p.id, p]));

    // Preserve the order in featuredProductIds
    products = featuredProductIds
      .map((id) => {
        const prod = productMap.get(id);
        if (!prod) return null;
        return {
          ...prod,
          rating: metricsMap.get(id)?.rating ?? 0,
          reviews: metricsMap.get(id)?.reviews ?? 0,
        };
      })
      .filter(Boolean);
  }

  return apiOk({ featuredProductIds, products });
}

export async function PUT(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  // Only vendor owner can change storefront featured products
  if (!access.access.isOwner) {
    return apiFail('FORBIDDEN', 'Only the vendor owner can select featured products for the storefront', 403);
  }

  const supabase = access.access.serviceDb;
  let body: { productIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiFail('BAD_REQUEST', 'Invalid JSON body', 400);
  }

  const productIds = body.productIds;
  if (!Array.isArray(productIds)) {
    return apiFail('BAD_REQUEST', 'productIds must be an array of UUIDs', 400);
  }

  if (productIds.length > 4) {
    return apiFail('VALIDATION_ERROR', 'You can select a maximum of 4 featured products', 422);
  }

  // Verify that all productIds belong to this vendor
  if (productIds.length > 0) {
    const { data: ownedProducts, error } = await supabase
      .from('products')
      .select('id, tags')
      .eq('vendor_id', vendorId)
      .in('id', productIds);

    if (error) {
      return apiFail('DB_ERROR', error.message, 500);
    }

    if (!ownedProducts || ownedProducts.length !== productIds.length) {
      return apiFail('INVALID_PRODUCT', 'One or more selected products do not belong to this vendor', 400);
    }
  }

  // Update products table tags:
  // 1. Remove 'featured' from all products of this vendor that are NOT in productIds
  const { data: currentFeatured } = await supabase
    .from('products')
    .select('id, tags')
    .eq('vendor_id', vendorId)
    .contains('tags', ['featured']);

  for (const prod of currentFeatured ?? []) {
    if (!productIds.includes(prod.id)) {
      const updatedTags = ((prod.tags as string[]) ?? []).filter((t: string) => t !== 'featured');
      await supabase
        .from('products')
        .update({ tags: updatedTags.length > 0 ? updatedTags : null })
        .eq('id', prod.id);
    }
  }

  // 2. Add 'featured' to all products in productIds
  if (productIds.length > 0) {
    const { data: toAddFeatured } = await supabase
      .from('products')
      .select('id, tags')
      .in('id', productIds);

    for (const prod of toAddFeatured ?? []) {
      const existingTags = (prod.tags as string[]) ?? [];
      if (!existingTags.includes('featured')) {
        await supabase
          .from('products')
          .update({ tags: [...existingTags, 'featured'] })
          .eq('id', prod.id);
      }
    }
  }

  // 3. Update vendors.featured_product_ids if column is available
  try {
    await supabase
      .from('vendors')
      .update({ featured_product_ids: productIds })
      .eq('id', vendorId);
  } catch {
    // Graceful fallback if column not yet added on remote DB
  }

  return apiOk({ success: true, featuredProductIds: productIds });
}

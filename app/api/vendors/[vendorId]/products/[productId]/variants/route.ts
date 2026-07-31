// P2 — Member 2: Variant list + create (B2)

import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { variantCreateSchema } from '@/lib/validation/vendor-schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { getScopedProduct } from '@/lib/vendor/product-scope';

interface Props { params: Promise<{ vendorId: string; productId: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { vendorId, productId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;

  const { data: product } = await getScopedProduct<{ id: string }>(supabase, vendorId, productId, access.access.outletIds, 'id');
  if (!product) return apiFail('NOT_FOUND', 'Product not found', 404);

  const { data, error } = await supabase
    .from('product_variants')
    .select('*, inventory(*)')
    .eq('product_id', productId)
    .order('sort_order');

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(data ?? []);
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId, productId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;

  // Verify product belongs to vendor
  const { data: product, outlet: productOutlet } = await getScopedProduct<{ id: string; requires_booking: boolean }>(
    supabase,
    vendorId,
    productId,
    access.access.outletIds,
    'id,requires_booking',
  );
  if (!product || !productOutlet) return apiFail('NOT_FOUND', 'Product not found in an assigned outlet', 404);

  const parsed = await parseBody(request, variantCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // If setting as default, unset other defaults
  if (body.isDefault) {
    await supabase
      .from('product_variants')
      .update({ is_default: false })
      .eq('product_id', productId);
  }

  const { data: variant, error } = await supabase.from('product_variants').insert({
    product_id: productId,
    name: body.name,
    price_offset: body.priceOffset,
    is_default: body.isDefault,
    sku: body.sku ?? null,
  }).select().single();

  if (error) return apiFail('DB_ERROR', error.message, 400);

  // Create inventory for non-booking products
  if (!product.requires_booking && variant) {
    await supabase.from('inventory').insert({
      variant_id: variant.id,
      outlet_id: productOutlet.id,
      quantity: 0,
      reserved: 0,
    });
  }

  return apiOk(variant, { status: 201 });
}

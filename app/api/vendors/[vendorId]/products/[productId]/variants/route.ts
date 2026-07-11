// P2 — Member 2: Variant list + create (B2)

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { variantCreateSchema } from '@/lib/validation/vendor-schemas';

interface Props { params: Promise<{ vendorId: string; productId: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { productId } = await params;
  const supabase = await createClient();

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
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: vendor } = await supabase
    .from('vendors')
    .select('owner_id')
    .eq('id', vendorId)
    .single();
  if (!vendor || vendor.owner_id !== user.id) return apiFail('FORBIDDEN', 'Not your vendor', 403);

  // Verify product belongs to vendor
  const { data: product } = await supabase
    .from('products')
    .select('id, requires_booking')
    .eq('id', productId)
    .eq('vendor_id', vendorId)
    .single();
  if (!product) return apiFail('NOT_FOUND', 'Product not found', 404);

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
      quantity: 0,
      reserved: 0,
    });
  }

  return apiOk(variant, { status: 201 });
}

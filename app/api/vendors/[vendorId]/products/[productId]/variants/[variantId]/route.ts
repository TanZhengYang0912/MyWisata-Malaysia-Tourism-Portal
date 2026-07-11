// P2 — Member 2: Single variant PATCH/DELETE (B2)

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { variantUpdateSchema } from '@/lib/validation/vendor-schemas';

interface Props { params: Promise<{ vendorId: string; productId: string; variantId: string }> }

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, productId, variantId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: vendor } = await supabase
    .from('vendors')
    .select('owner_id')
    .eq('id', vendorId)
    .single();
  if (!vendor || vendor.owner_id !== user.id) return apiFail('FORBIDDEN', 'Not your vendor', 403);

  const parsed = await parseBody(request, variantUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Update variant fields
  const variantUpdate: Record<string, unknown> = {};
  if (body.name !== undefined) variantUpdate.name = body.name;
  if (body.priceOffset !== undefined) variantUpdate.price_offset = body.priceOffset;
  if (body.sku !== undefined) variantUpdate.sku = body.sku;
  if (body.isActive !== undefined) variantUpdate.is_active = body.isActive;

  if (body.isDefault) {
    // Unset other defaults
    await supabase
      .from('product_variants')
      .update({ is_default: false })
      .eq('product_id', productId);
    variantUpdate.is_default = true;
  }

  if (Object.keys(variantUpdate).length > 0) {
    const { error } = await supabase
      .from('product_variants')
      .update(variantUpdate)
      .eq('id', variantId)
      .eq('product_id', productId);
    if (error) return apiFail('DB_ERROR', error.message, 500);
  }

  // Update inventory quantity if provided
  if (body.quantity !== undefined) {
    await supabase
      .from('inventory')
      .upsert({
        variant_id: variantId,
        quantity: body.quantity,
      }, { onConflict: 'variant_id' });
  }

  // Return updated variant + inventory
  const { data: updated } = await supabase
    .from('product_variants')
    .select('*, inventory(*)')
    .eq('id', variantId)
    .single();

  return apiOk(updated);
}

export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId, productId, variantId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: vendor } = await supabase
    .from('vendors')
    .select('owner_id')
    .eq('id', vendorId)
    .single();
  if (!vendor || vendor.owner_id !== user.id) return apiFail('FORBIDDEN', 'Not your vendor', 403);

  // Soft delete (set inactive)
  const { error } = await supabase
    .from('product_variants')
    .update({ is_active: false })
    .eq('id', variantId)
    .eq('product_id', productId);

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ id: variantId, is_active: false });
}

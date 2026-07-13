// P2 — Single variant PATCH/DELETE with vendor + outlet scope enforcement.

import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { variantUpdateSchema } from '@/lib/validation/vendor-schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string; productId: string; variantId: string }> }

async function scopedProduct(serviceDb: any, vendorId: string, productId: string, outletIds: string[]) {
  const { data } = await serviceDb
    .from('products')
    .select('id,outlet_id,requires_booking,review_status')
    .eq('id', productId)
    .eq('vendor_id', vendorId)
    .in('outlet_id', outletIds)
    .maybeSingle();
  return data;
}

async function refreshStockStatus(serviceDb: any, vendorId: string, productId: string) {
  const { data: variants } = await serviceDb
    .from('product_variants')
    .select('id,is_active,inventory(quantity,reserved)')
    .eq('product_id', productId);
  const available = (variants || []).some((variant: any) => variant.is_active && Number(variant.inventory?.[0]?.quantity || 0) - Number(variant.inventory?.[0]?.reserved || 0) > 0);
  const { data: product } = await serviceDb.from('products').select('requires_booking,review_status').eq('id', productId).eq('vendor_id', vendorId).maybeSingle();
  if (!product?.requires_booking) {
    await serviceDb
      .from('products')
      .update({ status: available && product.review_status === 'approved' ? 'active' : 'inactive' })
      .eq('id', productId)
      .eq('vendor_id', vendorId);
  }
}

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, productId, variantId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const serviceDb = access.access.serviceDb;

  const product = await scopedProduct(serviceDb, vendorId, productId, access.access.outletIds);
  if (!product) return apiFail('NOT_FOUND', 'Product not found', 404);
  const { data: variant } = await serviceDb.from('product_variants').select('id').eq('id', variantId).eq('product_id', productId).maybeSingle();
  if (!variant) return apiFail('NOT_FOUND', 'Variant not found', 404);

  const parsed = await parseBody(request, variantUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const variantUpdate: Record<string, unknown> = {};
  if (body.name !== undefined) variantUpdate.name = body.name;
  if (body.priceOffset !== undefined) variantUpdate.price_offset = body.priceOffset;
  if (body.sku !== undefined) variantUpdate.sku = body.sku;
  if (body.isActive !== undefined) variantUpdate.is_active = body.isActive;

  if (body.isDefault) {
    await serviceDb.from('product_variants').update({ is_default: false }).eq('product_id', productId);
    variantUpdate.is_default = true;
  }

  if (Object.keys(variantUpdate).length) {
    const { error } = await serviceDb.from('product_variants').update(variantUpdate).eq('id', variantId).eq('product_id', productId);
    if (error) return apiFail('DB_ERROR', error.message, 500);
  }

  if (body.quantity !== undefined) {
    const { error } = await serviceDb.from('inventory').upsert({ variant_id: variantId, quantity: body.quantity }, { onConflict: 'variant_id' });
    if (error) return apiFail('DB_ERROR', error.message, 500);
    await refreshStockStatus(serviceDb, vendorId, productId);
  }

  const { data: updated, error } = await serviceDb.from('product_variants').select('*, inventory(*)').eq('id', variantId).single();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(updated);
}

export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId, productId, variantId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const serviceDb = access.access.serviceDb;
  const product = await scopedProduct(serviceDb, vendorId, productId, access.access.outletIds);
  if (!product) return apiFail('NOT_FOUND', 'Product not found', 404);

  const { error } = await serviceDb.from('product_variants').update({ is_active: false }).eq('id', variantId).eq('product_id', productId);
  if (error) return apiFail('DB_ERROR', error.message, 500);
  await refreshStockStatus(serviceDb, vendorId, productId);
  return apiOk({ id: variantId, is_active: false });
}

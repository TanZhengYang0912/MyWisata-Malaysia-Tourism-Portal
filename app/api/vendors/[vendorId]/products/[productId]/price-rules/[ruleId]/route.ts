import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { priceRuleUpdateSchema } from '@/lib/validation/vendor-schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { getScopedProduct } from '@/lib/vendor/product-scope';

interface Props { params: Promise<{ vendorId: string; productId: string; ruleId: string }> }

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, productId, ruleId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const { data: product } = await getScopedProduct<{ id: string }>(access.access.serviceDb, vendorId, productId, access.access.outletIds, 'id');
  if (!product) return apiFail('NOT_FOUND', 'Product not found', 404);
  const parsed = await parseBody(request, priceRuleUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (body.ruleType !== undefined) updateData.rule_type = body.ruleType;
  if (body.label !== undefined) updateData.label = body.label;
  if (body.multiplier !== undefined) updateData.multiplier = body.multiplier;
  if (body.fixedAmount !== undefined) updateData.fixed_amount = body.fixedAmount;
  if (body.validFrom !== undefined) updateData.valid_from = body.validFrom;
  if (body.validUntil !== undefined) updateData.valid_until = body.validUntil;
  if (body.minQuantity !== undefined) updateData.min_quantity = body.minQuantity;
  if (body.bundleProductIds !== undefined) updateData.bundle_product_ids = body.bundleProductIds;
  if (body.priority !== undefined) updateData.priority = body.priority;
  if (body.isActive !== undefined) updateData.is_active = body.isActive;
  const { data, error } = await access.access.serviceDb.from('price_rules').update(updateData).eq('id', ruleId).eq('product_id', productId).select().maybeSingle();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (!data) return apiFail('NOT_FOUND', 'Pricing rule not found', 404);
  return apiOk(data);
}

export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId, productId, ruleId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const { data: product } = await getScopedProduct<{ id: string }>(access.access.serviceDb, vendorId, productId, access.access.outletIds, 'id');
  if (!product) return apiFail('NOT_FOUND', 'Product not found', 404);
  const { error } = await access.access.serviceDb.from('price_rules').update({ is_active: false }).eq('id', ruleId).eq('product_id', productId);
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ id: ruleId, isActive: false });
}

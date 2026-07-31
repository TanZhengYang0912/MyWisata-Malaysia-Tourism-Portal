import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { priceRuleCreateSchema } from '@/lib/validation/vendor-schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { getScopedProduct } from '@/lib/vendor/product-scope';

interface Props { params: Promise<{ vendorId: string; productId: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { vendorId, productId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const { data: product } = await getScopedProduct<{ id: string }>(access.access.serviceDb, vendorId, productId, access.access.outletIds, 'id');
  if (!product) return apiFail('NOT_FOUND', 'Product not found', 404);
  const { data, error } = await access.access.serviceDb.from('price_rules').select('*').eq('product_id', productId).order('created_at', { ascending: false });
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(data || []);
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId, productId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const parsed = await parseBody(request, priceRuleCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { data: product } = await getScopedProduct<{ id: string }>(access.access.serviceDb, vendorId, productId, access.access.outletIds, 'id');
  if (!product) return apiFail('NOT_FOUND', 'Product not found', 404);
  const body = parsed.data;
  const { data, error } = await access.access.serviceDb.from('price_rules').insert({
    product_id: productId,
    rule_type: body.ruleType,
    label: body.label,
    multiplier: body.multiplier ?? null,
    fixed_amount: body.fixedAmount ?? null,
    valid_from: body.validFrom ?? null,
    valid_until: body.validUntil ?? null,
    min_quantity: body.minQuantity ?? null,
    bundle_product_ids: body.bundleProductIds ?? null,
    priority: body.priority ?? 0,
  }).select().single();
  if (error) return apiFail('DB_ERROR', error.message, 400);
  return apiOk(data, { status: 201 });
}

// P2 — Member 2: Single voucher PATCH (B3)

import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { voucherUpdateSchema } from '@/lib/validation/vendor-schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { isProductEligibleForVoucherOutlet } from '@/lib/vendor/voucher-scope';

interface Props { params: Promise<{ vendorId: string; voucherId: string }> }

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, voucherId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;

  const parsed = await parseBody(request, voucherUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { data: existing, error: existingError } = await supabase
    .from('vouchers')
    .select('outlet_id,product_id')
    .eq('id', voucherId)
    .eq('vendor_id', vendorId)
    .maybeSingle();
  if (existingError) return apiFail('DB_ERROR', existingError.message, 500);
  if (!existing) return apiFail('NOT_FOUND', 'Voucher not found', 404);

  const targetOutletId = body.outletId !== undefined ? body.outletId : existing.outlet_id;
  const targetProductId = body.productId !== undefined ? body.productId : existing.product_id;
  if (targetOutletId) {
    const { data: outlet } = await supabase.from('outlets').select('id').eq('id', targetOutletId).eq('vendor_id', vendorId).maybeSingle();
    if (!outlet) return apiFail('INVALID_OUTLET', 'Outlet not found or not owned by this vendor', 400);
  }
  if (targetProductId) {
    const { data: product } = await supabase.from('products').select('id,outlet_id,outlet_offers(outlet_id,status)').eq('id', targetProductId).eq('vendor_id', vendorId).maybeSingle();
    if (!product) return apiFail('INVALID_PRODUCT', 'Product not found or not owned by this vendor', 400);
    if (targetOutletId && !isProductEligibleForVoucherOutlet({
      productOutletId: product.outlet_id,
      offers: (product.outlet_offers ?? []).map((offer: { outlet_id: string; status: string | null }) => ({ outletId: offer.outlet_id, status: offer.status })),
      selectedOutletId: targetOutletId,
    })) return apiFail('INVALID_PRODUCT_SCOPE', 'Product is not sold at the selected outlet', 400);
  }

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.discountValue !== undefined) updateData.discount_value = body.discountValue;
  if (body.minSpend !== undefined) updateData.min_spend = body.minSpend;
  if (body.maxUses !== undefined) updateData.max_uses = body.maxUses;
  if (body.perCustomerLimit !== undefined) updateData.per_customer_limit = body.perCustomerLimit;
  if (body.validFrom !== undefined) updateData.valid_from = body.validFrom;
  if (body.validUntil !== undefined) updateData.valid_until = body.validUntil;
  if (body.redemptionMode !== undefined) updateData.redemption_mode = body.redemptionMode;
  if (body.isClaimable !== undefined) updateData.is_claimable = body.isClaimable;
  if (body.outletId !== undefined) updateData.outlet_id = body.outletId;
  if (body.voucherType !== undefined) updateData.voucher_type = body.voucherType;
  if (body.productId !== undefined) updateData.product_id = body.productId;
  if (body.buyQuantity !== undefined) updateData.buy_quantity = body.buyQuantity;
  if (body.freeQuantity !== undefined) updateData.free_quantity = body.freeQuantity;
  if (body.isActive !== undefined) updateData.is_active = body.isActive;

  const contentChanged = ['name', 'voucherType', 'discountValue', 'minSpend', 'maxUses', 'perCustomerLimit', 'validFrom', 'validUntil', 'redemptionMode', 'isClaimable', 'outletId', 'productId', 'buyQuantity', 'freeQuantity'].some((key) => body[key as keyof typeof body] !== undefined);
  if (contentChanged) {
    updateData.review_status = 'pending_review';
    updateData.review_note = null;
    updateData.reviewed_by = null;
    updateData.reviewed_at = null;
    updateData.is_active = false;
  }

  const { data, error } = await supabase
    .from('vouchers')
    .update(updateData)
    .eq('id', voucherId)
    .eq('vendor_id', vendorId)
    .select()
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(data);
}

// P2 — Member 2: Single voucher PATCH (B3)

import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { voucherUpdateSchema } from '@/lib/validation/vendor-schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string; voucherId: string }> }

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, voucherId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;

  const parsed = await parseBody(request, voucherUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.discountValue !== undefined) updateData.discount_value = body.discountValue;
  if (body.minSpend !== undefined) updateData.min_spend = body.minSpend;
  if (body.maxUses !== undefined) updateData.max_uses = body.maxUses;
  if (body.perCustomerLimit !== undefined) updateData.per_customer_limit = body.perCustomerLimit;
  if (body.validFrom !== undefined) updateData.valid_from = body.validFrom;
  if (body.validUntil !== undefined) updateData.valid_until = body.validUntil;
  if (body.voucherType !== undefined) updateData.voucher_type = body.voucherType;
  if (body.productId !== undefined) updateData.product_id = body.productId;
  if (body.buyQuantity !== undefined) updateData.buy_quantity = body.buyQuantity;
  if (body.freeQuantity !== undefined) updateData.free_quantity = body.freeQuantity;
  if (body.isActive !== undefined) updateData.is_active = body.isActive;

  const contentChanged = ['name', 'voucherType', 'discountValue', 'minSpend', 'maxUses', 'perCustomerLimit', 'validFrom', 'validUntil', 'productId', 'buyQuantity', 'freeQuantity'].some((key) => body[key as keyof typeof body] !== undefined);
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

// P2 — Member 2: Voucher validation contract (B3)
// Used by Member 4 (D1 Cart/Checkout) to validate voucher codes
// POST /api/vouchers/validate

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { voucherValidateSchema } from '@/lib/validation/vendor-schemas';
import { applyPercent } from '@/lib/money';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const parsed = await parseBody(request, voucherValidateSchema);
  if (!parsed.ok) return parsed.response;
  const { code, cartSubtotal, vendorId, items } = parsed.data;

  // Find voucher
  const { data: voucher } = await supabase
    .from('vouchers')
    .select('*')
    .eq('code', code)
    .single();

  if (!voucher) {
    return apiOk({ valid: false, reason: 'Voucher code not found' });
  }

  // Check active
  if (!voucher.is_active) {
    return apiOk({ valid: false, reason: 'This voucher is no longer active' });
  }

  // Check vendor match (if vendorId provided)
  if (vendorId && voucher.vendor_id !== vendorId) {
    return apiOk({ valid: false, reason: 'This voucher is not valid for this vendor' });
  }

  // Check validity period
  const now = new Date();
  if (voucher.valid_from && new Date(voucher.valid_from) > now) {
    return apiOk({ valid: false, reason: 'This voucher is not yet valid' });
  }
  if (voucher.valid_until && new Date(voucher.valid_until) < now) {
    return apiOk({ valid: false, reason: 'This voucher has expired' });
  }

  // Check usage limit
  if (voucher.max_uses !== null && voucher.uses_count >= voucher.max_uses) {
    return apiOk({ valid: false, reason: 'This voucher has reached its usage limit' });
  }
  if (voucher.max_uses !== null && Number(voucher.uses_count ?? 0) + Number(voucher.reserved_uses ?? 0) >= voucher.max_uses) {
    return apiOk({ valid: false, reason: 'This voucher is temporarily reserved at capacity' });
  }
  if (voucher.outlet_id && !(items ?? []).some((item) => item.outletId === voucher.outlet_id)) {
    return apiOk({ valid: false, reason: 'This voucher is not valid for the selected outlet' });
  }
  if (voucher.product_id && !(items ?? []).some((item) => item.productId === voucher.product_id)) {
    return apiOk({ valid: false, reason: 'Add the eligible product to use this voucher' });
  }
  if (voucher.per_customer_limit !== null && user) {
    const { count } = await supabase.from('voucher_redemptions').select('id', { count: 'exact', head: true }).eq('voucher_id', voucher.id).eq('user_id', user.id);
    if (Number(count ?? 0) >= Number(voucher.per_customer_limit)) {
      return apiOk({ valid: false, reason: 'You have reached this voucher’s per-customer limit' });
    }
  }

  // Check minimum spend
  if (cartSubtotal < voucher.min_spend) {
    return apiOk({
      valid: false,
      reason: `Minimum spend of RM ${voucher.min_spend.toFixed(2)} required (current: RM ${cartSubtotal.toFixed(2)})`,
    });
  }

  if (voucher.review_status && voucher.review_status !== 'approved') {
    return apiOk({ valid: false, reason: 'This voucher is still awaiting approval' });
  }

  // Calculate discount
  let discountAmount: number;
  if (voucher.voucher_type === 'bogo') {
    const eligible = (items ?? []).find((item) => item.productId === voucher.product_id);
    const buyQuantity = Number(voucher.buy_quantity ?? 0);
    const freeQuantity = Number(voucher.free_quantity ?? 0);
    if (!eligible || buyQuantity < 1 || freeQuantity < 1) {
      return apiOk({ valid: false, reason: 'Add the eligible product to your cart to use this voucher' });
    }
    discountAmount = Math.min(cartSubtotal, Math.floor(eligible.quantity / buyQuantity) * freeQuantity * eligible.unitPrice);
  } else if (voucher.voucher_type === 'percent') {
    discountAmount = applyPercent(cartSubtotal, voucher.discount_value);
  } else {
    // Fixed amount — cannot exceed cart subtotal
    discountAmount = Math.min(voucher.discount_value, cartSubtotal);
  }

  if (user) {
    await supabase.from('voucher_events').insert({ voucher_id: voucher.id, user_id: user.id, event_type: 'apply_success', metadata: { cartSubtotal } });
  }
  return apiOk({
    valid: true,
    voucherId: voucher.id,
    vendorId: voucher.vendor_id,
    outletId: voucher.outlet_id,
    voucherType: voucher.voucher_type,
    discountValue: voucher.discount_value,
    discountAmount,
    code: voucher.code,
    name: voucher.name,
  });
}

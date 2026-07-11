// P2 — Member 2: Voucher validation contract (B3)
// Used by Member 4 (D1 Cart/Checkout) to validate voucher codes
// POST /api/vouchers/validate

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { voucherValidateSchema } from '@/lib/validation/vendor-schemas';
import { applyPercent } from '@/lib/money';

export async function POST(request: Request) {
  const supabase = await createClient();

  const parsed = await parseBody(request, voucherValidateSchema);
  if (!parsed.ok) return parsed.response;
  const { code, cartSubtotal, vendorId } = parsed.data;

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

  // Check minimum spend
  if (cartSubtotal < voucher.min_spend) {
    return apiOk({
      valid: false,
      reason: `Minimum spend of RM ${voucher.min_spend.toFixed(2)} required (current: RM ${cartSubtotal.toFixed(2)})`,
    });
  }

  // Calculate discount
  let discountAmount: number;
  if (voucher.voucher_type === 'percent') {
    discountAmount = applyPercent(cartSubtotal, voucher.discount_value);
  } else {
    // Fixed amount — cannot exceed cart subtotal
    discountAmount = Math.min(voucher.discount_value, cartSubtotal);
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

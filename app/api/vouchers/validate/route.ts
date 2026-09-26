// P2 — Member 2: Voucher validation contract (B3)
// Used by Member 4 (D1 Cart/Checkout) to validate voucher codes
// POST /api/vouchers/validate

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiFail, apiOk } from '@/lib/validation/schemas';
import { voucherValidateSchema } from '@/lib/validation/vendor-schemas';
import { applyPercent } from '@/lib/money';
import { formatMYR } from '@/lib/i18n/format';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const parsed = await parseBody(request, voucherValidateSchema);
  if (!parsed.ok) return parsed.response;
  const { code, cartSubtotal, vendorId, items, intent } = parsed.data;

  // Find voucher
  const { data: voucher } = await supabase
    .from('vouchers')
    .select('*')
    .eq('code', code)
    .single();

  if (!voucher) {
    return apiOk({ valid: false, reason: 'Voucher code not found' });
  }

  async function recordEvent(eventType: 'viewed' | 'entered' | 'apply_success' | 'apply_failed', metadata: Record<string, unknown> = {}) {
    if (user) await supabase.from('voucher_events').insert({ voucher_id: voucher.id, user_id: user.id, event_type: eventType, metadata });
  }

  async function invalid(reason: string) {
    await recordEvent(intent === 'view' ? 'viewed' : 'apply_failed', { reason, cartSubtotal });
    return apiOk({ valid: false, reason });
  }

  if (intent === 'apply') await recordEvent('entered', { cartSubtotal });

  // Check active
  if (!voucher.is_active) {
    return invalid('This voucher is no longer active');
  }
  if (!['online', 'both'].includes(voucher.redemption_mode)) {
    return invalid('This voucher is for in-store redemption');
  }

  // Check vendor match (if vendorId provided)
  if (vendorId && voucher.vendor_id !== vendorId) {
    return invalid('This voucher is not valid for this vendor');
  }

  // Check validity period
  const now = new Date();
  if (voucher.valid_from && new Date(voucher.valid_from) > now) {
    return invalid('This voucher is not yet valid');
  }
  if (voucher.valid_until && new Date(voucher.valid_until) < now) {
    return invalid('This voucher has expired');
  }

  // Check usage limit
  if (voucher.max_uses !== null && voucher.uses_count >= voucher.max_uses) {
    return invalid('This voucher has reached its usage limit');
  }
  if (voucher.max_uses !== null && Number(voucher.uses_count ?? 0) + Number(voucher.reserved_uses ?? 0) >= voucher.max_uses) {
    return invalid('This voucher is temporarily reserved at capacity');
  }
  const candidateItems = items ?? [];
  if (!candidateItems.length && (voucher.vendor_id || voucher.outlet_id || voucher.product_id)) {
    return invalid('Select eligible items before applying this voucher');
  }
  const productIds = [...new Set(candidateItems.map((item) => item.productId))];
  const outletIds = [...new Set(candidateItems.map((item) => item.outletId).filter((id): id is string => Boolean(id)))];
  const [{ data: productRows, error: productError }, { data: outletRows, error: outletError }] = await Promise.all([
    productIds.length
      ? supabase.from('products').select('id,vendor_id,outlet_id,outlet_offers(outlet_id,status)').in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
    outletIds.length
      ? supabase.from('outlets').select('id,vendor_id').in('id', outletIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (productError || outletError) return apiFail('DB_ERROR', 'Unable to verify voucher coverage', 503);

  const productsById = new Map((productRows ?? []).map((product: {
    id: string;
    vendor_id: string;
    outlet_id: string | null;
    outlet_offers?: { outlet_id: string; status: string | null }[] | null;
  }) => [product.id, product]));
  const outletsById = new Map((outletRows ?? []).map((outlet: { id: string; vendor_id: string }) => [outlet.id, outlet]));
  const verifiedItems = candidateItems.flatMap((item) => {
    const product = productsById.get(item.productId);
    const outlet = item.outletId ? outletsById.get(item.outletId) : undefined;
    if (!product || !outlet || outlet.vendor_id !== product.vendor_id) return [];
    const soldAtOutlet = product.outlet_id === outlet.id || (product.outlet_offers ?? []).some(
      (offer) => offer.outlet_id === outlet.id && offer.status === 'active',
    );
    if (!soldAtOutlet) return [];
    if (voucher.vendor_id && product.vendor_id !== voucher.vendor_id) return [];
    if (voucher.outlet_id && outlet.id !== voucher.outlet_id) return [];
    if (voucher.product_id && product.id !== voucher.product_id) return [];
    return [{ ...item, productId: product.id, vendorId: product.vendor_id }];
  });
  if (!verifiedItems.length) return invalid('This voucher is not valid for the selected items');
  const eligibleSubtotal = verifiedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (voucher.per_customer_limit !== null && user) {
    const { count } = await supabase.from('voucher_redemptions').select('id', { count: 'exact', head: true }).eq('voucher_id', voucher.id).eq('user_id', user.id);
    if (Number(count ?? 0) >= Number(voucher.per_customer_limit)) {
      return invalid('You have reached this voucher’s per-customer limit');
    }
  }

  // Check minimum spend
  if (eligibleSubtotal < voucher.min_spend) {
    return invalid(`Minimum spend of ${formatMYR(voucher.min_spend)} required (current: ${formatMYR(eligibleSubtotal)})`);
  }

  if (voucher.review_status && voucher.review_status !== 'approved') {
    return invalid('This voucher is still awaiting approval');
  }

  // Calculate discount
  let discountAmount: number;
  if (voucher.voucher_type === 'bogo') {
    const buyQuantity = Number(voucher.buy_quantity ?? 0);
    const freeQuantity = Number(voucher.free_quantity ?? 0);
    if (buyQuantity < 1 || freeQuantity < 1) {
      return invalid('Add the eligible product to your cart to use this voucher');
    }
    discountAmount = Math.min(eligibleSubtotal, verifiedItems.reduce((sum, eligible) => (
      sum + Math.floor(eligible.quantity / buyQuantity) * freeQuantity * eligible.unitPrice
    ), 0));
  } else if (voucher.voucher_type === 'percent') {
    discountAmount = applyPercent(eligibleSubtotal, voucher.discount_value);
  } else {
    // Fixed amount — cannot exceed the voucher-eligible subtotal
    discountAmount = Math.min(voucher.discount_value, eligibleSubtotal);
  }

  await recordEvent(intent === 'view' ? 'viewed' : 'apply_success', { cartSubtotal, discountAmount });
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

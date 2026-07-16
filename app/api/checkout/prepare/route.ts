import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, checkoutPrepareSchema } from '@/lib/validation/schemas';
import { buildCheckoutRequestHash, normalizeCheckoutRequest } from '@/lib/checkout/idempotency';
import { getActivities } from '@/backend/domains/catalogue';
import { cartTotals, unitPrice } from '@/backend/core/helpers';
import type { CartItem, Voucher } from '@/backend/core/types';
import { stripe } from '@/lib/stripe';

type Relation<T> = T | T[] | null;
type CartRow = {
  id: string;
  variant_id: string | null;
  slot_id: string | null;
  quantity: number;
  product_variants: Relation<{ id: string; product_id: string; name: string }>;
  booking_slots: Relation<{ id: string; product_id: string; outlet_id: string; starts_at: string; price_override: number | null }>;
};

function relation<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody(request, checkoutPrepareSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const normalized = normalizeCheckoutRequest(body);
  const requestHash = buildCheckoutRequestHash(normalized);

  const { data: cart, error: cartError } = await db.from('carts').select('id').eq('user_id', user.id).maybeSingle();
  if (cartError) return NextResponse.json({ error: cartError.message }, { status: 500 });
  if (!cart) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });

  const { data: rows, error: rowsError } = await db
    .from('cart_items')
    .select('id,variant_id,slot_id,quantity,product_variants(id,product_id,name),booking_slots(id,product_id,outlet_id,starts_at,price_override)')
    .eq('cart_id', cart.id)
    .order('created_at');
  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });

  let activities;
  try {
    activities = await getActivities(db);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load catalogue' }, { status: 503 });
  }
  const activityMap = new Map(activities.map((activity) => [activity.id, activity]));
  const typedRows = (rows ?? []) as unknown as CartRow[];
  const selectedRows = typedRows.filter((row) => {
    const variant = relation(row.product_variants);
    const slot = relation(row.booking_slots);
    const productId = variant?.product_id ?? slot?.product_id;
    const key = `${productId}|${row.variant_id ?? ''}|${row.slot_id ?? ''}`;
    return !body.selectedKeys?.length || body.selectedKeys.includes(key);
  });
  if (!selectedRows.length) return NextResponse.json({ error: 'Select at least one cart item' }, { status: 400 });

  let voucher: Voucher | undefined;
  if (body.voucherCode) {
    const { data: voucherRow, error: voucherError } = await db.from('vouchers')
      .select('id,code,name,voucher_type,discount_value,min_spend,max_uses,uses_count,valid_until,product_id,buy_quantity,free_quantity')
      .ilike('code', body.voucherCode)
      .eq('is_active', true)
      .eq('review_status', 'approved')
      .maybeSingle();
    if (voucherError) return NextResponse.json({ error: voucherError.message }, { status: 500 });
    if (!voucherRow) return NextResponse.json({ error: 'Voucher is not available' }, { status: 422 });
    voucher = {
      id: voucherRow.id,
      code: voucherRow.code,
      name: voucherRow.name ?? undefined,
      type: voucherRow.voucher_type,
      value: Number(voucherRow.discount_value),
      minSpend: Number(voucherRow.min_spend ?? 0),
      usageCap: voucherRow.max_uses ?? Infinity,
      usageCount: Number(voucherRow.uses_count ?? 0),
      expiresAt: voucherRow.valid_until ?? '',
      productId: voucherRow.product_id ?? undefined,
      buyQuantity: voucherRow.buy_quantity ?? undefined,
      freeQuantity: voucherRow.free_quantity ?? undefined,
    };
  }

  const cartItems: CartItem[] = selectedRows.map((row) => {
    const variant = relation(row.product_variants);
    const slot = relation(row.booking_slots);
    const productId = variant?.product_id ?? slot?.product_id ?? '';
    return {
      activityId: productId,
      variantId: row.variant_id ?? '',
      slotId: row.slot_id ?? undefined,
      qty: row.quantity,
      priceOverride: slot?.price_override === null || slot?.price_override === undefined ? undefined : Number(slot.price_override),
    };
  });
  const totals = cartTotals(cartItems, activities, voucher);
  if (voucher && totals.voucherError) return NextResponse.json({ error: totals.voucherError }, { status: 422 });

  const productIds = [...new Set(cartItems.map((item) => item.activityId))];
  const { data: productRows } = await db.from('products').select('id,outlet_id,vendor_id,name,cover_url,requires_booking').in('id', productIds);
  const productMap = new Map((productRows ?? []).map((row) => [row.id, row]));

  const lines = selectedRows.map((row) => {
    const variant = relation(row.product_variants);
    const slot = relation(row.booking_slots);
    const productId = variant?.product_id ?? slot?.product_id ?? '';
    const activity = activityMap.get(productId);
    const product = productMap.get(productId);
    if (!activity || !product || !variant) throw new Error('Cart contains an unavailable product');
    const linePrice = slot?.price_override !== null && slot?.price_override !== undefined
      ? Number(slot.price_override)
      : unitPrice(activity, variant.id, row.quantity, new Date(), productIds);
    return {
      cart_item_id: row.id,
      product_id: productId,
      variant_id: variant.id,
      slot_id: row.slot_id,
      vendor_id: product.vendor_id,
      outlet_id: product.outlet_id,
      product_name: product.name,
      image_url: product.cover_url,
      variant_name: variant.name,
      slot_starts_at: slot?.starts_at ?? null,
      unit_price: linePrice,
      quantity: row.quantity,
      line_total: Number((linePrice * row.quantity).toFixed(2)),
      requires_booking: product.requires_booking,
    };
  });

  const { data: prepared, error: prepareError } = await db.rpc('prepare_checkout', {
    p_cart_id: cart.id,
    p_selected_item_ids: selectedRows.map((row) => row.id),
    p_idempotency_key: body.idempotencyKey,
    p_request_hash: requestHash,
    p_payment_method: normalized.paymentMethod,
    p_subtotal: totals.subtotal,
    p_discount: totals.discount,
    p_total: totals.total,
    p_voucher_code: normalized.voucherCode,
    p_lines: lines,
  });
  if (prepareError) {
    const rawMessage = prepareError.message ?? "checkout_failed";
    const code = rawMessage.includes("booking_capacity_unavailable")
      ? "BOOKING_CAPACITY_UNAVAILABLE"
      : rawMessage.includes("booking_slot_invalid")
        ? "BOOKING_SLOT_INVALID"
        : rawMessage.includes("inventory_unavailable")
          ? "INVENTORY_UNAVAILABLE"
          : "CHECKOUT_FAILED";
    return NextResponse.json(
      { error: { code, message: rawMessage } },
      { status: 409 },
    );
  }

  const response = { ...(prepared as Record<string, unknown>), total: totals.total };
  if (normalized.paymentMethod === 'stripe_card' && prepared?.status !== 'paid') {
    const origin = request.headers.get('origin') ?? 'http://localhost:3000';
    const checkoutSessionId = String(prepared.checkout_session_id);
    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'myr',
          unit_amount: Math.round(totals.total * 100),
          product_data: { name: `MyWisata order ${String(prepared.order_id).slice(0, 8)}` },
        },
        quantity: 1,
      }],
      metadata: { user_id: user.id, checkout_session_id: checkoutSessionId, order_id: String(prepared.order_id), payment_kind: 'order' },
      success_url: `${origin}/customer/checkout?stripe_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/customer/checkout?stripe_cancelled=1`,
    });
    const service = createServiceClient();
    await service.from('payments').update({ provider_payment_id: stripeSession.id, status: 'requires_action', updated_at: new Date().toISOString() }).eq('order_id', prepared.order_id);
    await service.from('checkout_sessions').update({ status: 'requires_action', updated_at: new Date().toISOString() }).eq('id', checkoutSessionId);
    return NextResponse.json({ data: { ...response, stripeUrl: stripeSession.url }, error: null });
  }
  return NextResponse.json({ data: response, error: null });
}

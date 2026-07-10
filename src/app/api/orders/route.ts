// P4 — Member 4 owns D1 checkout + D2 order creation

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { add, lineTotal, applyPercent, subtract } from '@/lib/money';
import { onOrderPaid } from '@/lib/domain-events';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: '' } }, { status: 401 });

  const { paymentMethod, voucherCode } = await request.json();

  // 1. Fetch cart with items
  const { data: cart } = await supabase
    .from('carts')
    .select(`
      id,
      cart_items (
        id, quantity, unit_price, variant_id, slot_id,
        product_variants ( name, products ( id, name, vendor_id, outlet_id ) ),
        booking_slots ( id, products ( id, name, vendor_id, outlet_id ) )
      )
    `)
    .eq('user_id', user.id)
    .single();

  if (!cart || !(cart.cart_items as unknown[]).length) {
    return NextResponse.json({ data: null, error: { code: 'EMPTY_CART', message: 'Cart is empty' } }, { status: 400 });
  }

  const items = cart.cart_items as Record<string, unknown>[];
  const subtotal = items.reduce(
    (s, i) => add(s, lineTotal(Number(i.unit_price), Number(i.quantity))), 0,
  );

  // 2. Validate voucher (TODO P4/D1: full validation against vouchers table)
  let discountAmount = 0;
  if (voucherCode) {
    const { data: voucher } = await supabase
      .from('vouchers')
      .select('*')
      .eq('code', voucherCode.toUpperCase())
      .eq('is_active', true)
      .gte('valid_until', new Date().toISOString())
      .single();

    if (voucher) {
      if (voucher.voucher_type === 'percent') discountAmount = applyPercent(subtotal, voucher.discount_value);
      if (voucher.voucher_type === 'fixed')   discountAmount = Math.min(voucher.discount_value, subtotal);
    }
  }

  const total = subtract(subtotal, discountAmount);

  // 3. Create order
  const { data: order } = await supabase.from('orders').insert({
    user_id:        user.id,
    status:         'paid', // mock: immediately paid
    subtotal,
    discount_amount: discountAmount,
    total_amount:   total,
    payment_method: paymentMethod,
    voucher_code:   voucherCode ?? null,
    paid_at:        new Date().toISOString(),
  }).select().single();

  if (!order) return NextResponse.json({ data: null, error: { code: 'ORDER_FAILED', message: 'Failed to create order' } }, { status: 500 });

  // 4. Create order items (snapshots)
  for (const item of items) {
    const product = (item.product_variants as Record<string, unknown>)?.products
      ?? (item.booking_slots as Record<string, unknown>)?.products as Record<string, unknown>;
    const slot = item.booking_slots as Record<string, unknown> | null;

    await supabase.from('order_items').insert({
      order_id:      order.id,
      vendor_id:     product?.vendor_id,
      outlet_id:     product?.outlet_id,
      product_id:    product?.id,
      variant_id:    item.variant_id ?? null,
      slot_id:       item.slot_id   ?? null,
      product_name:  String(product?.name ?? 'Unknown'),
      variant_name:  String((item.product_variants as Record<string, unknown>)?.name ?? '') || null,
      slot_starts_at: slot?.starts_at ?? null,
      unit_price:    Number(item.unit_price),
      quantity:      Number(item.quantity),
      line_total:    lineTotal(Number(item.unit_price), Number(item.quantity)),
    });
  }

  // 5. Record mock payment
  await supabase.from('payments').insert({
    order_id:    order.id,
    method:      paymentMethod,
    amount:      total,
    status:      'succeeded',
    gateway_ref: 'DEMO-MOCK',
    processed_at: new Date().toISOString(),
  });

  // 6. Clear cart
  await supabase.from('cart_items').delete().eq('cart_id', cart.id);

  // 7. Domain event (audit + notification)
  await onOrderPaid(order.id, user.id);

  return NextResponse.json({ data: { orderId: order.id }, error: null }, { status: 201 });
}

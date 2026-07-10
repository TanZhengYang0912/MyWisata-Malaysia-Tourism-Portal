// P4 — Member 4 owns D1 Cart API

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { variantPrice } from '@/lib/money';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: '' } }, { status: 401 });

  const { data: cart } = await supabase
    .from('carts')
    .select(`
      *,
      cart_items (
        id, quantity, unit_price,
        product_variants ( id, name, price_offset, products ( id, name, cover_url, base_price ) ),
        booking_slots ( id, starts_at, products ( id, name ) )
      )
    `)
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({ data: cart, error: null });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: '' } }, { status: 401 });

  const body = await request.json();
  const { variantId, slotId, quantity = 1 } = body;

  if (!variantId && !slotId) {
    return NextResponse.json({ data: null, error: { code: 'INVALID', message: 'variantId or slotId required' } }, { status: 400 });
  }

  // Get or create cart
  let { data: cart } = await supabase.from('carts').select('id').eq('user_id', user.id).single();
  if (!cart) {
    const { data: newCart } = await supabase.from('carts').insert({ user_id: user.id }).select('id').single();
    cart = newCart;
  }

  // Compute unit_price
  let unitPrice = 0;
  if (variantId) {
    const { data: variant } = await supabase
      .from('product_variants')
      .select('price_offset, products(base_price)')
      .eq('id', variantId)
      .single();
    if (variant) {
      unitPrice = variantPrice(
        Number((variant.products as Record<string, unknown>)?.base_price ?? 0),
        Number(variant.price_offset),
      );
    }
  } else if (slotId) {
    const { data: slot } = await supabase
      .from('booking_slots')
      .select('price_override, products(base_price)')
      .eq('id', slotId)
      .single();
    if (slot) {
      unitPrice = slot.price_override != null
        ? Number(slot.price_override)
        : Number((slot.products as Record<string, unknown>)?.base_price ?? 0);
    }
  }

  // TODO P4/D1: check inventory / slot capacity before inserting
  const { data: item, error } = await supabase.from('cart_items').insert({
    cart_id:    cart!.id,
    variant_id: variantId ?? null,
    slot_id:    slotId    ?? null,
    quantity,
    unit_price: unitPrice,
  }).select().single();

  if (error) return NextResponse.json({ data: null, error: { code: 'DB_ERROR', message: error.message } }, { status: 400 });
  return NextResponse.json({ data: item, error: null }, { status: 201 });
}

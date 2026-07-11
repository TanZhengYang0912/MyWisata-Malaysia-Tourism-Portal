'use client';
// P4 — Member 4 owns this hook (D1 Cart)

import { useEffect, useState, useCallback } from 'react';
import type { CartSummary } from '@/types';
import { add, lineTotal } from '@/lib/money';

export function useCart() {
  const [cart,    setCart]    = useState<CartSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCart = useCallback(async () => {
    setLoading(true);
    // TODO P4/D1: call GET /api/cart
    const res = await fetch('/api/cart');
    const { data } = await res.json();

    if (!data) { setCart(null); setLoading(false); return; }

    const items = ((data.cart_items as Record<string, unknown>[]) ?? []).map(i => {
      const variant = i.product_variants as Record<string, unknown> | null;
      const slot    = i.booking_slots    as Record<string, unknown> | null;
      const product = (variant?.products ?? slot?.products) as Record<string, unknown> | null;
      return {
        id:          String(i.id),
        variantId:   i.variant_id ? String(i.variant_id) : null,
        slotId:      i.slot_id    ? String(i.slot_id)    : null,
        productName: String(product?.name ?? 'Unknown'),
        variantName: variant?.name ? String(variant.name) : null,
        outletName:  '',
        unitPrice:   Number(i.unit_price),
        quantity:    Number(i.quantity),
        lineTotal:   lineTotal(Number(i.unit_price), Number(i.quantity)),
        coverUrl:    product?.cover_url ? String(product.cover_url) : null,
        slotStartsAt: slot?.starts_at ? String(slot.starts_at) : null,
      };
    });

    const subtotal = items.reduce((s, i) => add(s, i.lineTotal), 0);

    setCart({ items, subtotal, discountAmount: 0, total: subtotal, appliedVoucherCode: null });
    setLoading(false);
  }, []);

  useEffect(() => { fetchCart(); }, [fetchCart]);

  async function addToCart(variantId?: string, slotId?: string, quantity = 1) {
    await fetch('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId, slotId, quantity }),
    });
    await fetchCart();
  }

  async function checkout(paymentMethod: 'mock_card' | 'wallet', voucherCode?: string) {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethod, voucherCode }),
    });
    return res.json();
  }

  return { cart, loading, addToCart, checkout, refetch: fetchCart };
}

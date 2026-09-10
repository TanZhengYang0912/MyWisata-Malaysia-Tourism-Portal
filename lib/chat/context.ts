// P4 — server-built context-card snapshots for chat messages.
//
// The snapshot (chat_messages.context_snapshot) is frozen display data — the
// client never supplies title/price/image, only the id. This resolves the id
// against the DB and returns null if the caller isn't entitled to attach it
// (product not sold at this outlet / order not this customer's), so the
// message still sends, just without a card.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessageContext } from '@/backend/core/types';
import { formatMYR } from '@/lib/i18n/format';
import { productImageUrl } from '@/lib/storage/product-image';

/** Product the customer is inquiring about — valid only if sold at the thread's outlet. */
export async function buildProductContextSnapshot(
  service: SupabaseClient,
  productId: string,
  outletId: string,
): Promise<ChatMessageContext | null> {
  const { data: product } = await service
    .from('products')
    .select('id, name, base_price, cover_url, outlet_id')
    .eq('id', productId)
    .eq('status', 'active')
    .maybeSingle();
  if (!product) return null;

  let price = Number(product.base_price);
  if (product.outlet_id !== outletId) {
    const { data: offer } = await service
      .from('outlet_offers')
      .select('price')
      .eq('product_id', productId)
      .eq('outlet_id', outletId)
      .eq('status', 'active')
      .maybeSingle();
    if (!offer) return null; // not this outlet's product
    price = Number(offer.price);
  }

  return {
    type: 'product',
    id: product.id,
    title: product.name,
    subtitle: formatMYR(price),
    imageUrl: productImageUrl(product.cover_url),
    href: `/customer/activity/${product.id}`,
  };
}

/** Order a vendor is attaching as a Booking-Confirmation card — valid only if it belongs to this customer and a vendor outlet. */
export async function buildOrderContextSnapshot(
  service: SupabaseClient,
  orderId: string,
  customerId: string,
  vendorOutletIds: string[],
): Promise<ChatMessageContext | null> {
  const { data: order } = await service
    .from('orders')
    .select('id, display_id, status, total_amount, user_id')
    .eq('id', orderId)
    .eq('user_id', customerId)
    .maybeSingle();
  if (!order) return null;

  const { data: items } = await service
    .from('order_items')
    .select('product_name, quantity, outlet_id')
    .eq('order_id', orderId);
  const rows = items ?? [];
  if (!rows.some((i) => vendorOutletIds.includes(i.outlet_id))) return null; // not this vendor's order

  const count = rows.reduce((sum, i) => sum + Number(i.quantity ?? 1), 0);
  return {
    type: 'order',
    id: order.id,
    title: order.display_id ?? `#${order.id.slice(0, 8)}`,
    subtitle: `${count} item${count === 1 ? '' : 's'} · ${formatMYR(Number(order.total_amount))} · ${order.status}`,
    imageUrl: null,
    href: `/vendor/orders?order=${order.id}`,
  };
}

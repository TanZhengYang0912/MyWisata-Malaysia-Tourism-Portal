import type { SupabaseClient } from '@supabase/supabase-js';
import { emitVendorNotification, type VendorNotificationCategory } from '@/lib/vendor-notifications/emit';
import type { VendorAudience } from '@/lib/vendor-notifications/scope';

type OrderEventOptions = {
  serviceDb: SupabaseClient;
  orderId: string;
  eventKey: string;
  audience?: VendorAudience;
  category?: VendorNotificationCategory;
  type?: string;
  title?: string;
  body?: string;
  link?: string;
  email?: boolean;
  reference?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

/** Emit an order event once per vendor/outlet line after an order mutation. */
export async function emitOrderVendorEvent(options: OrderEventOptions): Promise<void> {
  const { data: items } = await options.serviceDb
    .from('order_items')
    .select('id,vendor_id,outlet_id,product_name,line_total')
    .eq('order_id', options.orderId);
  const seen = new Set<string>();
  const orderItemById = new Map<string, { vendor_id: string | null; outlet_id: string | null }>();
  for (const item of items ?? []) {
    if (!item.vendor_id) continue;
    orderItemById.set(String(item.id), item);
    const key = `${item.vendor_id}:${item.outlet_id ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await emitVendorNotification({
      eventKey: `${options.eventKey}:${item.vendor_id}:${item.outlet_id ?? 'vendor'}`,
      vendorId: item.vendor_id,
      outletId: item.outlet_id,
      audience: options.audience ?? 'owner_and_assigned_outlet',
      category: options.category ?? 'vendor_orders',
      type: options.type ?? 'vendor_order_updated',
      title: options.title ?? 'Order updated',
      body: options.body ?? `Order ${options.orderId} was updated.`,
      link: options.link ?? `/vendor/orders/${options.orderId}`,
      email: options.email ?? true,
      reference: options.reference ?? options.orderId,
      metadata: options.metadata,
      serviceDb: options.serviceDb,
    });
  }

  // Booking rows are created by the checkout RPC. Emit a separate operational
  // booking event (App-only) for each booking line after the paid order event.
  const orderItemIds = [...orderItemById.keys()];
  if (orderItemIds.length) {
    const { data: bookings } = await options.serviceDb
      .from('bookings')
      .select('id,order_item_id,status')
      .in('order_item_id', orderItemIds);
    for (const booking of bookings ?? []) {
      const item = orderItemById.get(String(booking.order_item_id));
      if (!item?.vendor_id) continue;
      await emitVendorNotification({
        eventKey: `${options.eventKey}:booking:${booking.id}:${item.vendor_id}`,
        vendorId: item.vendor_id,
        outletId: item.outlet_id,
        audience: 'owner_and_assigned_outlet',
        category: 'vendor_bookings',
        type: 'vendor_booking_created',
        title: 'New booking received',
        body: `Booking ${booking.id} was created for your outlet.`,
        link: `/vendor/bookings/${booking.id}`,
        email: false,
        reference: String(booking.id),
        metadata: { status: typeof booking.status === 'string' ? booking.status : 'confirmed' },
        serviceDb: options.serviceDb,
      });
    }
  }
}

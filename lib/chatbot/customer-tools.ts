import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';

export type CustomerStatusKind = 'orders' | 'bookings' | 'refunds' | 'tickets';

export interface CustomerStatusItem {
  id: string;
  status: string;
  label: string;
  href: string;
  createdAt: string;
}

export type CustomerStatusResult =
  | { state: 'available'; items: CustomerStatusItem[] }
  | { state: 'no_records'; items: [] }
  | { state: 'unavailable'; items: [] };

const REFUND_STATUSES = new Set(['pending', 'approved', 'processed', 'rejected', 'failed']);
const ORDER_STATUSES = new Set(['DRAFT', 'PENDING_PAYMENT', 'PAID', 'COMPLETED', 'CANCELLED', 'REFUNDED']);
const BOOKING_STATUSES = new Set(['confirmed', 'cancelled', 'completed', 'checked_in']);
const TICKET_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);

export async function queryCustomerSupportStatus(
  db: SupabaseClient,
  userId: string,
  kind: CustomerStatusKind,
): Promise<CustomerStatusResult> {
  if (kind === 'orders') {
    const { data, error } = await db.from('orders')
      .select('id,status,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return { state: 'unavailable', items: [] };
    const items = (data ?? []).map((row) => ({
      id: row.id,
      status: ORDER_STATUSES.has(row.status) ? row.status : 'unknown',
      label: `#${row.id.slice(0, 8).toUpperCase()}`,
      href: `/customer/orders/${row.id}`,
      createdAt: row.created_at,
    }));
    return items.length ? { state: 'available', items } : { state: 'no_records', items: [] };
  }

  if (kind === 'bookings') {
    const { data, error } = await db.from('bookings')
      .select('id,status,created_at')
      .eq('customer_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return { state: 'unavailable', items: [] };
    const items = (data ?? []).map((row) => ({
      id: row.id,
      status: BOOKING_STATUSES.has(row.status) ? row.status : 'unknown',
      label: `#${row.id.slice(0, 8).toUpperCase()}`,
      href: `/customer/bookings/${row.id}`,
      createdAt: row.created_at,
    }));
    return items.length ? { state: 'available', items } : { state: 'no_records', items: [] };
  }

  if (kind === 'tickets') {
    const { data, error } = await db.from('support_tickets')
      .select('id,subject,status,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return { state: 'unavailable', items: [] };
    const items = (data ?? []).map((row) => ({
      id: row.id,
      status: TICKET_STATUSES.has(row.status) ? row.status : 'unknown',
      label: row.subject,
      href: `/customer/support/${row.id}`,
      createdAt: row.created_at,
    }));
    return items.length ? { state: 'available', items } : { state: 'no_records', items: [] };
  }

  const { data: orders, error: ordersError } = await db.from('orders')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (ordersError) return { state: 'unavailable', items: [] };
  if (!orders?.length) return { state: 'no_records', items: [] };
  // Refunds lack a customer SELECT policy. The order IDs above were obtained
  // through the caller's RLS-scoped query and explicitly filtered by owner.
  const { data: refunds, error: refundsError } = await createServiceClient().from('refunds')
    .select('id,order_id,status,created_at')
    .in('order_id', orders.map((order) => order.id))
    .order('created_at', { ascending: false })
    .limit(5);
  if (refundsError) return { state: 'unavailable', items: [] };
  const items = (refunds ?? []).map((refund) => ({
    id: refund.id,
    status: REFUND_STATUSES.has(refund.status) ? refund.status : 'unknown',
    label: `#${refund.order_id.slice(0, 8).toUpperCase()}`,
    href: `/customer/orders/${refund.order_id}`,
    createdAt: refund.created_at,
  }));
  return items.length ? { state: 'available', items } : { state: 'no_records', items: [] };
}

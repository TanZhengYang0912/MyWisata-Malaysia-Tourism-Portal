import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { formatOrderReference } from '@/lib/checkout/order-reference';

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
const ORDER_STATUSES = new Set(['draft', 'pending_payment', 'paid', 'completed', 'cancelled', 'refunded']);
const BOOKING_STATUSES = new Set(['confirmed', 'in_use', 'checked_in', 'no_show', 'cancelled', 'completed']);
const TICKET_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);

export async function queryCustomerSupportStatus(
  db: SupabaseClient,
  userId: string,
  kind: CustomerStatusKind,
): Promise<CustomerStatusResult> {
  if (kind === 'orders') {
    const { data, error } = await db.from('orders')
      .select('id,display_id,status,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return { state: 'unavailable', items: [] };
    const items = (data ?? []).map((row) => ({
      id: row.id,
      status: ORDER_STATUSES.has(row.status.toLowerCase()) ? row.status.toLowerCase() : 'unknown',
      label: formatOrderReference(row.id, row.display_id),
      href: `/customer/orders/${row.id}`,
      createdAt: row.created_at,
    }));
    return items.length ? { state: 'available', items } : { state: 'no_records', items: [] };
  }

  if (kind === 'bookings') {
    const { data, error } = await db.from('bookings')
      .select('id,display_id,status,created_at')
      .eq('customer_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return { state: 'unavailable', items: [] };
    const items = (data ?? []).map((row) => ({
      id: row.id,
      status: BOOKING_STATUSES.has(row.status) ? row.status : 'unknown',
      label: formatOrderReference(row.id, row.display_id),
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

  // Refund rows do not expose a customer read policy or an API relationship
  // to orders. The service-only function joins ownership in SQL and returns
  // only the latest five matching rows, without reading/slicing all orders.
  const { data: refunds, error: refundsError } = await createServiceClient()
    .rpc('list_support_customer_refunds', { p_owner_user_id: userId });
  if (refundsError) return { state: 'unavailable', items: [] };
  const refundRows = (refunds ?? []) as Array<{
    id: string;
    order_id: string;
    order_display_id?: string | null;
    status: string;
    created_at: string;
  }>;
  const items = refundRows.map((refund) => ({
    id: refund.id,
    status: REFUND_STATUSES.has(refund.status) ? refund.status : 'unknown',
    label: formatOrderReference(refund.order_id, refund.order_display_id),
    href: `/customer/orders/${refund.order_id}`,
    createdAt: refund.created_at,
  }));
  return items.length ? { state: 'available', items } : { state: 'no_records', items: [] };
}

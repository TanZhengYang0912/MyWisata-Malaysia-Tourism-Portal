import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { formatOrderReference } from '@/lib/checkout/order-reference';
import { allowedCustomerStatusActions, type CustomerStatusKind, type SupportPolicyAction } from './policy';

export type { CustomerStatusKind } from './policy';

export interface CustomerStatusItem {
  id: string;
  kind: CustomerStatusKind;
  status: string;
  label: string;
  href: string;
  createdAt: string;
  actions: readonly SupportPolicyAction[];
}

export type CustomerStatusResult =
  | { state: 'available'; items: CustomerStatusItem[] }
  | { state: 'no_records'; items: [] }
  | { state: 'unavailable'; items: [] };

const REFUND_STATUSES = new Set(['pending', 'approved', 'processed', 'rejected', 'failed']);
const ORDER_STATUSES = new Set(['draft', 'pending_payment', 'paid', 'completed', 'cancelled', 'refunded']);
const BOOKING_STATUSES = new Set(['confirmed', 'in_use', 'checked_in', 'no_show', 'cancelled', 'completed']);
const TICKET_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const WITHDRAWAL_STATUSES = new Set(['pending', 'pending_second_approval', 'approved', 'processing', 'hold', 'overdue', 'rejected', 'paid', 'completed', 'failed']);
const KYC_STATUSES = new Set(['draft', 'pending', 'info_requested', 'approved', 'rejected', 'superseded', 'withdrawn']);

function recordActions(kind: CustomerStatusKind, status: string): readonly SupportPolicyAction[] {
  return allowedCustomerStatusActions(kind, status === 'unknown' ? 'unavailable' : 'verified_record');
}

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
      kind,
      status: ORDER_STATUSES.has(row.status.toLowerCase()) ? row.status.toLowerCase() : 'unknown',
      label: formatOrderReference(row.id, row.display_id),
      href: `/customer/orders/${row.id}`,
      createdAt: row.created_at,
    })).map((item) => ({ ...item, actions: recordActions(kind, item.status) }));
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
      kind,
      status: BOOKING_STATUSES.has(row.status) ? row.status : 'unknown',
      label: formatOrderReference(row.id, row.display_id),
      href: `/customer/bookings/${row.id}`,
      createdAt: row.created_at,
    })).map((item) => ({ ...item, actions: recordActions(kind, item.status) }));
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
      kind,
      status: TICKET_STATUSES.has(row.status) ? row.status : 'unknown',
      label: row.subject,
      href: `/customer/support/${row.id}`,
      createdAt: row.created_at,
    })).map((item) => ({ ...item, actions: recordActions(kind, item.status) }));
    return items.length ? { state: 'available', items } : { state: 'no_records', items: [] };
  }

  if (kind === 'withdrawals') {
    const { data, error } = await createServiceClient().from('withdrawal_requests')
      .select('id,status,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return { state: 'unavailable', items: [] };
    const items = (data ?? []).map((row) => {
      const status = WITHDRAWAL_STATUSES.has(row.status) ? row.status : 'unknown';
      return {
        id: row.id,
        kind,
        status,
        label: 'Withdrawal request',
        href: `/customer/wallet/withdrawals/${row.id}`,
        createdAt: row.created_at,
        actions: recordActions(kind, status),
      };
    });
    return items.length ? { state: 'available', items } : { state: 'no_records', items: [] };
  }

  if (kind === 'kyc') {
    const { data, error } = await createServiceClient().from('kyc_submissions')
      .select('id,status,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { state: 'unavailable', items: [] };
    if (!data) return { state: 'no_records', items: [] };
    const status = KYC_STATUSES.has(data.status) ? data.status : 'unknown';
    return { state: 'available', items: [{
      id: data.id,
      kind,
      status,
      label: 'Identity verification',
      href: '/customer/kyc',
      createdAt: data.created_at,
      actions: recordActions(kind, status),
    }] };
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
    kind,
    status: REFUND_STATUSES.has(refund.status) ? refund.status : 'unknown',
    label: formatOrderReference(refund.order_id, refund.order_display_id),
    href: `/customer/orders/${refund.order_id}`,
    createdAt: refund.created_at,
  })).map((item) => ({ ...item, actions: recordActions(kind, item.status) }));
  return items.length ? { state: 'available', items } : { state: 'no_records', items: [] };
}

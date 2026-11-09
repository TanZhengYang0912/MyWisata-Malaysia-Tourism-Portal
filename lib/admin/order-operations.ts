import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const PAGE_SIZE = 25;
const CURSOR_VERSION = 1;
const timelineCursorSchema = z.object({
  version: z.literal(CURSOR_VERSION),
  orderId: z.string().uuid(),
  beforeAt: z.string().datetime({ offset: true }),
  beforeKey: z.string().regex(/^[a-z0-9_]+:[0-9a-f-]{36}$/).max(120),
  watermark: z.string().datetime({ offset: true }),
}).strict();

export type AdminOrderSection = 'summary' | 'timeline';
export type AdminOrderReadResult =
  | { status: 'ok'; data: Record<string, unknown> }
  | { status: 'not_found' }
  | { status: 'invalid_cursor' }
  | { status: 'unavailable' };

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function encodeCursor(value: z.infer<typeof timelineCursorSchema>) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeCursor(value: string, orderId: string) {
  if (value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed = timelineCursorSchema.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (!parsed.success || parsed.data.orderId !== orderId || Date.parse(parsed.data.beforeAt) > Date.now()
      || Date.parse(parsed.data.watermark) > Date.now() + 60_000
      || Date.parse(parsed.data.beforeAt) > Date.parse(parsed.data.watermark)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

type OrderHeader = {
  id: string;
  display_id: string | null;
  user_id: string | null;
  status: string;
  subtotal: number | string;
  discount_amount: number | string;
  total_amount: number | string;
  currency: string;
  payment_method: string | null;
  voucher_code: string | null;
  paid_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

function timelineCursorFilter(
  column: string,
  sourceKey: string,
  cursor: z.infer<typeof timelineCursorSchema> | null,
): string {
  if (!cursor) return 'id.not.is.null';
  const [cursorKey, cursorId] = cursor.beforeKey.split(':');
  if (sourceKey < cursorKey) return `${column}.lte.${cursor.beforeAt}`;
  if (sourceKey > cursorKey) return `${column}.lt.${cursor.beforeAt}`;
  return `${column}.lt.${cursor.beforeAt},and(${column}.eq.${cursor.beforeAt},id.lt.${cursorId})`;
}

export async function readAdminOrderDetail(
  db: SupabaseClient,
  orderId: string,
  section: AdminOrderSection,
  cursorValue: string | null,
): Promise<AdminOrderReadResult> {
  const { data: order, error: orderError } = await db.from('orders')
    .select('id,display_id,user_id,status,subtotal,discount_amount,total_amount,currency,payment_method,voucher_code,paid_at,completed_at,cancelled_at,created_at,updated_at')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) return { status: 'unavailable' };
  if (!order) return { status: 'not_found' };
  const header = order as unknown as OrderHeader;
  const orderView = {
    id: header.id,
    displayId: header.display_id,
    customerType: header.user_id ? 'account' : 'guest',
    status: header.status,
    subtotal: Number(header.subtotal),
    discountAmount: Number(header.discount_amount),
    totalAmount: Number(header.total_amount),
    currency: header.currency,
    paymentMethod: header.payment_method,
    voucherCode: header.voucher_code,
    paidAt: header.paid_at,
    completedAt: header.completed_at,
    cancelledAt: header.cancelled_at,
    createdAt: header.created_at,
    updatedAt: header.updated_at,
  };

  if (section === 'summary') {
    const [itemsResult, paymentsResult, refundsResult, eventCountResult] = await Promise.all([
      db.from('order_items')
        .select('id,product_name,quantity,line_total,fulfil_status,fulfilled_at,event_listing_id,pickup_date,slot_starts_at,vendors(name),outlets(name)', { count: 'exact' })
        .eq('order_id', orderId).order('created_at', { ascending: true }).order('id', { ascending: true }).range(0, PAGE_SIZE - 1),
      db.from('payments')
        .select('id,method,status,amount,created_at,processed_at', { count: 'exact' })
        .eq('order_id', orderId).order('created_at', { ascending: false }).order('id', { ascending: false }).range(0, PAGE_SIZE - 1),
      db.from('refunds')
        .select('id,amount,status,created_at,processed_at', { count: 'exact' })
        .eq('order_id', orderId).order('created_at', { ascending: false }).order('id', { ascending: false }).range(0, PAGE_SIZE - 1),
      db.from('payment_events').select('id', { count: 'exact', head: true }).eq('order_id', orderId),
    ]);
    if (itemsResult.error || paymentsResult.error || refundsResult.error || eventCountResult.error) return { status: 'unavailable' };
    const items = itemsResult.data ?? [];
    const itemIds = items.map((item) => item.id);
    const [bookingsResult, passesResult] = itemIds.length > 0 ? await Promise.all([
      db.from('bookings').select('id,order_item_id,status,check_in_at,created_at').in('order_item_id', itemIds)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1),
      db.from('ticket_passes').select('id,booking_id,order_item_id,policy,entry_limit,entries_used,status,valid_from,valid_until').in('order_item_id', itemIds)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1),
    ]) : [
      { data: [], error: null }, { data: [], error: null },
    ];
    if (bookingsResult.error || passesResult.error) return { status: 'unavailable' };
    const bookings = bookingsResult.data ?? [];
    const bookingIds = bookings.slice(0, PAGE_SIZE + 1).map((booking) => booking.id);
    const checkInsResult = bookingIds.length
      ? await db.from('check_in_events').select('id,booking_id,entries_admitted,entries_used_after,scanned_at').in('booking_id', bookingIds)
        .order('scanned_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1)
      : { data: [], error: null };
    if (checkInsResult.error) return { status: 'unavailable' };
    const passes = passesResult.data ?? [];
    const checkIns = checkInsResult.data ?? [];
    return {
      status: 'ok',
      data: {
        order: orderView,
        items: items.map((item) => ({
          id: item.id,
          productName: item.product_name,
          quantity: item.quantity,
          lineTotal: item.line_total,
          fulfilmentStatus: item.fulfil_status,
          fulfilledAt: item.fulfilled_at,
          eventDate: item.pickup_date,
          slotStartsAt: item.slot_starts_at,
          vendorName: one(item.vendors)?.name ?? null,
          outletName: one(item.outlets)?.name ?? null,
        })),
        payments: (paymentsResult.data ?? []).map((payment) => ({
          id: payment.id, method: payment.method, status: payment.status,
          amount: payment.amount, createdAt: payment.created_at, processedAt: payment.processed_at,
        })),
        refunds: (refundsResult.data ?? []).map((refund) => ({
          id: refund.id, amount: refund.amount, status: refund.status,
          createdAt: refund.created_at, processedAt: refund.processed_at,
        })),
        bookings: bookings.slice(0, PAGE_SIZE).map((booking) => ({
          id: booking.id, orderItemId: booking.order_item_id, status: booking.status,
          checkInAt: booking.check_in_at, createdAt: booking.created_at,
        })),
        passes: passes.slice(0, PAGE_SIZE).map((pass) => ({
          id: pass.id, bookingId: pass.booking_id, orderItemId: pass.order_item_id,
          policy: pass.policy, entryLimit: pass.entry_limit, entriesUsed: pass.entries_used,
          status: pass.status, validFrom: pass.valid_from, validUntil: pass.valid_until,
        })),
        checkIns: checkIns.slice(0, PAGE_SIZE).map((event) => ({
          id: event.id, bookingId: event.booking_id, entriesAdmitted: event.entries_admitted,
          entriesUsedAfter: event.entries_used_after, scannedAt: event.scanned_at,
        })),
        hasMore: {
          items: (itemsResult.count ?? 0) > PAGE_SIZE,
          payments: (paymentsResult.count ?? 0) > PAGE_SIZE,
          refunds: (refundsResult.count ?? 0) > PAGE_SIZE,
          paymentEvents: (eventCountResult.count ?? 0) > 0,
          bookings: bookings.length > PAGE_SIZE,
          passes: passes.length > PAGE_SIZE,
          checkIns: checkIns.length > PAGE_SIZE,
        },
      },
    };
  }

  const cursor = cursorValue ? decodeCursor(cursorValue, orderId) : null;
  if (cursorValue && !cursor) return { status: 'invalid_cursor' };
  const watermark = cursor?.watermark ?? new Date().toISOString();
  const [itemsResult, paymentCreatedResult, paymentProcessedResult, paymentEventsResult,
    refundCreatedResult, refundProcessedResult, bookingsResult, bookingCheckInsResult, checkInsResult] = await Promise.all([
    db.from('order_items').select('id,fulfil_status,fulfilled_at').eq('order_id', orderId).not('fulfilled_at', 'is', null)
      .lte('fulfilled_at', watermark).or(timelineCursorFilter('fulfilled_at', '10_fulfilment', cursor))
      .order('fulfilled_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1),
    db.from('payments').select('id,status,amount,created_at').eq('order_id', orderId).lte('created_at', watermark).or(timelineCursorFilter('created_at', '20_payment_created', cursor))
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1),
    db.from('payments').select('id,status,amount,processed_at').eq('order_id', orderId).not('processed_at', 'is', null).lte('processed_at', watermark).or(timelineCursorFilter('processed_at', '21_payment_processed', cursor))
      .order('processed_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1),
    db.from('payment_events').select('id,created_at').eq('order_id', orderId).lte('created_at', watermark).or(timelineCursorFilter('created_at', '22_payment_event', cursor))
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1),
    db.from('refunds').select('id,status,amount,created_at').eq('order_id', orderId).lte('created_at', watermark).or(timelineCursorFilter('created_at', '30_refund_created', cursor))
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1),
    db.from('refunds').select('id,status,amount,processed_at').eq('order_id', orderId).not('processed_at', 'is', null).lte('processed_at', watermark).or(timelineCursorFilter('processed_at', '31_refund_processed', cursor))
      .order('processed_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1),
    db.from('bookings').select('id,status,created_at,order_items!inner(order_id)').eq('order_items.order_id', orderId).lte('created_at', watermark).or(timelineCursorFilter('created_at', '40_booking_created', cursor))
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1),
    db.from('bookings').select('id,status,check_in_at,order_items!inner(order_id)').eq('order_items.order_id', orderId).not('check_in_at', 'is', null).lte('check_in_at', watermark).or(timelineCursorFilter('check_in_at', '41_booking_check_in', cursor))
      .order('check_in_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1),
    db.from('check_in_events').select('id,entries_admitted,entries_used_after,scanned_at,ticket_passes!inner(order_items!inner(order_id))')
      .eq('ticket_passes.order_items.order_id', orderId).lte('scanned_at', watermark).or(timelineCursorFilter('scanned_at', '50_check_in', cursor))
      .order('scanned_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1),
  ]);
  if (itemsResult.error || paymentCreatedResult.error || paymentProcessedResult.error || paymentEventsResult.error
    || refundCreatedResult.error || refundProcessedResult.error || bookingsResult.error || bookingCheckInsResult.error || checkInsResult.error) {
    return { status: 'unavailable' };
  }

  const events: Array<{ occurredAt: string; eventKey: string; kind: string; status: string | null; amount: number | null }> = [
    { occurredAt: header.created_at, eventKey: `order_created:${header.id}`, kind: 'order', status: header.status, amount: null },
    ...(header.paid_at ? [{ occurredAt: header.paid_at, eventKey: `order_paid:${header.id}`, kind: 'order', status: header.status, amount: Number(header.total_amount) }] : []),
    ...(header.completed_at ? [{ occurredAt: header.completed_at, eventKey: `order_completed:${header.id}`, kind: 'order', status: header.status, amount: null }] : []),
    ...(header.cancelled_at ? [{ occurredAt: header.cancelled_at, eventKey: `order_cancelled:${header.id}`, kind: 'order', status: header.status, amount: null }] : []),
    ...(itemsResult.data ?? []).map((item) => ({ occurredAt: item.fulfilled_at, eventKey: `10_fulfilment:${item.id}`, kind: 'fulfilment', status: item.fulfil_status, amount: null })),
    ...(paymentCreatedResult.data ?? []).map((payment) => ({ occurredAt: payment.created_at, eventKey: `20_payment_created:${payment.id}`, kind: 'payment', status: payment.status, amount: Number(payment.amount ?? 0) })),
    ...(paymentProcessedResult.data ?? []).map((payment) => ({ occurredAt: payment.processed_at, eventKey: `21_payment_processed:${payment.id}`, kind: 'payment', status: payment.status, amount: Number(payment.amount ?? 0) })),
    ...(paymentEventsResult.data ?? []).map((event) => ({ occurredAt: event.created_at, eventKey: `22_payment_event:${event.id}`, kind: 'payment', status: null, amount: null })),
    ...(refundCreatedResult.data ?? []).map((refund) => ({ occurredAt: refund.created_at, eventKey: `30_refund_created:${refund.id}`, kind: 'refund', status: refund.status, amount: Number(refund.amount ?? 0) })),
    ...(refundProcessedResult.data ?? []).map((refund) => ({ occurredAt: refund.processed_at, eventKey: `31_refund_processed:${refund.id}`, kind: 'refund', status: refund.status, amount: Number(refund.amount ?? 0) })),
    ...(bookingsResult.data ?? []).map((booking) => ({ occurredAt: booking.created_at, eventKey: `40_booking_created:${booking.id}`, kind: 'booking', status: booking.status, amount: null })),
    ...(bookingCheckInsResult.data ?? []).map((booking) => ({ occurredAt: booking.check_in_at, eventKey: `41_booking_check_in:${booking.id}`, kind: 'booking', status: booking.status, amount: null })),
    ...(checkInsResult.data ?? []).map((event) => ({ occurredAt: event.scanned_at, eventKey: `50_check_in:${event.id}`, kind: 'check_in', status: null, amount: null })),
  ].filter((event) => event.occurredAt <= watermark)
    .filter((event) => !cursor || event.occurredAt < cursor.beforeAt || (event.occurredAt === cursor.beforeAt && event.eventKey < cursor.beforeKey))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.eventKey.localeCompare(left.eventKey));

  const page = events.slice(0, PAGE_SIZE);
  const sourceRows = [itemsResult.data, paymentCreatedResult.data, paymentProcessedResult.data, paymentEventsResult.data,
    refundCreatedResult.data, refundProcessedResult.data, bookingsResult.data, bookingCheckInsResult.data, checkInsResult.data];
  const hasMore = events.length > PAGE_SIZE || sourceRows.some((rows) => (rows?.length ?? 0) > PAGE_SIZE);
  const last = page.at(-1);
  const nextCursor = hasMore && last ? encodeCursor({
    version: CURSOR_VERSION, orderId, beforeAt: last.occurredAt, beforeKey: last.eventKey, watermark,
  }) : null;
  return {
    status: 'ok',
    data: {
      order: orderView,
      events: page,
      nextCursor,
      hasMore,
    },
  };
}

import { z } from 'zod';

import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  status: z.enum(['all', 'pending_payment', 'paid', 'completed', 'cancelled', 'failed', 'refunded']).default('all'),
  search: z.string().trim().max(36).default(''),
});

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function GET(request: Request) {
  const { response } = await requireStaffPermission('admin.orders.read');
  if (response) return response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'Invalid order query parameters.', 422, parsed.error.flatten());
  const { page, status, search } = parsed.data;
  if (search && !UUID.test(search)) return apiFail('VALIDATION_FAILED', 'Search using a complete order ID.', 422);

  try {
    const service = createServiceClient();
    let ordersQuery = service.from('orders')
      .select('id,user_id,status,subtotal,discount_amount,total_amount,currency,payment_method,voucher_code,paid_at,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (status !== 'all') ordersQuery = ordersQuery.eq('status', status);
    if (search) ordersQuery = ordersQuery.eq('id', search);

    const { data: orders, count, error: ordersError } = await ordersQuery;
    if (ordersError) return apiFail('ORDERS_UNAVAILABLE', 'Unable to load orders right now.', 503);

    const orderRows = orders ?? [];
    const orderIds = orderRows.map((order) => order.id);
    const userIds = [...new Set(orderRows.map((order) => order.user_id))];
    if (orderIds.length === 0) return apiOk({ orders: [], page, pageSize: PAGE_SIZE, total: count ?? 0 });

    const [usersResult, itemsResult, paymentsResult] = await Promise.all([
      service.from('users').select('id,full_name,email').in('id', userIds),
      service.from('order_items')
        .select('id,order_id,vendor_id,outlet_id,product_name,quantity,line_total,fulfil_status,vendors!fk_oi_vendor(name),outlets!fk_oi_outlet(name)')
        .in('order_id', orderIds)
        .order('created_at', { ascending: true })
        .limit(1000),
      service.from('payments')
        .select('order_id,method,provider,status,amount,created_at')
        .in('order_id', orderIds)
        .order('created_at', { ascending: false })
        .limit(250),
    ]);
    if (usersResult.error || itemsResult.error || paymentsResult.error) {
      return apiFail('ORDERS_UNAVAILABLE', 'Unable to load order details right now.', 503);
    }

    const usersById = new Map((usersResult.data ?? []).map((row) => [row.id, row]));
    const itemsByOrder = new Map<string, typeof itemsResult.data>();
    for (const item of itemsResult.data ?? []) {
      const items = itemsByOrder.get(item.order_id) ?? [];
      items.push(item);
      itemsByOrder.set(item.order_id, items);
    }
    const latestPaymentByOrder = new Map<string, NonNullable<typeof paymentsResult.data>[number]>();
    for (const payment of paymentsResult.data ?? []) {
      if (!latestPaymentByOrder.has(payment.order_id)) latestPaymentByOrder.set(payment.order_id, payment);
    }

    return apiOk({
      orders: orderRows.map((order) => ({
        ...order,
        customer: (() => {
          const customer = usersById.get(order.user_id);
          return { name: customer?.full_name ?? null, email: customer?.email ?? null };
        })(),
        items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
          id: item.id,
          productName: item.product_name,
          quantity: item.quantity,
          lineTotal: item.line_total,
          fulfilStatus: item.fulfil_status,
          vendorId: item.vendor_id,
          vendorName: one(item.vendors)?.name ?? null,
          outletId: item.outlet_id,
          outletName: one(item.outlets)?.name ?? null,
        })),
        payment: latestPaymentByOrder.get(order.id) ?? null,
      })),
      page,
      pageSize: PAGE_SIZE,
      total: count ?? 0,
    });
  } catch {
    return apiFail('ORDERS_UNAVAILABLE', 'Unable to load orders right now.', 503);
  }
}

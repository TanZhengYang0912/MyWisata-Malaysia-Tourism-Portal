import { z } from 'zod';

import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { requireAccessControlSuperAdmin } from '@/lib/entitlements/admin-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  status: z.enum(['all', 'pending_payment', 'paid', 'completed', 'cancelled', 'failed', 'refunded']).default('all'),
  search: z.string().trim().max(36).default(''),
  vendorId: z.string().uuid().optional(),
});

type OrderListRow = {
  id: string;
  display_id: string | null;
  user_id: string | null;
  guest_subject_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  status: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  payment_method: string | null;
  voucher_code: string | null;
  paid_at: string | null;
  created_at: string;
  order_items?: Array<{ vendor_id: string }>;
};

export async function GET(request: Request) {
  const { response } = await requireStaffPermission('admin.orders.read');
  if (response) return response;
  const superAdmin = await requireAccessControlSuperAdmin();
  const canCorrectGuestContact = !superAdmin.response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'Invalid order query parameters.', 422, parsed.error.flatten());
  const { page, status, search, vendorId } = parsed.data;
  const orderSearch = search.replace(/^#/, '');
  if (orderSearch && !/^[a-z0-9-]+$/i.test(orderSearch)) return apiFail('VALIDATION_FAILED', 'Search using a complete order ID.', 422);

  try {
    const service = createServiceClient();
    const orderSelection = 'id,display_id,user_id,guest_subject_id,contact_name,contact_email,status,subtotal,discount_amount,total_amount,currency,payment_method,voucher_code,paid_at,created_at';
    let ordersQuery = service.from('orders').select(
      vendorId ? `${orderSelection},order_items!inner(vendor_id)` : orderSelection,
      { count: 'exact' },
    );
    if (status !== 'all') ordersQuery = ordersQuery.eq('status', status);
    if (orderSearch) ordersQuery = ordersQuery.eq(UUID.test(orderSearch) ? 'id' : 'display_id', orderSearch);
    if (vendorId) ordersQuery = ordersQuery.eq('order_items.vendor_id', vendorId);
    ordersQuery = ordersQuery.order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const orderResult = await ordersQuery;
    if (orderResult.error) return apiFail('ORDERS_UNAVAILABLE', 'Unable to load orders right now.', 503);

    // `types/database.ts` is a manual approximation without relationship metadata;
    // the FK and PostgREST inner join are defined in migrations and used elsewhere.
    const orderRows = (orderResult.data ?? []) as unknown as OrderListRow[];
    const count = orderResult.count;
    const orderIds = orderRows.map((order) => order.id);
    const userIds = [...new Set(orderRows.map((order) => order.user_id).filter(Boolean))];
    if (orderIds.length === 0) return apiOk({ orders: [], page, pageSize: PAGE_SIZE, total: count ?? 0, canCorrectGuestContact });

    const [usersResult, associationsResult] = await Promise.all([
      userIds.length > 0
        ? service.from('users').select('id,full_name,email').in('id', userIds)
        : Promise.resolve({ data: [], error: null }),
      service.rpc('admin_order_list_association_summaries', { p_order_ids: orderIds }),
    ]);
    if (usersResult.error || associationsResult.error || !associationsResult.data || typeof associationsResult.data !== 'object') {
      return apiFail('ORDERS_UNAVAILABLE', 'Unable to load order details right now.', 503);
    }

    const usersById = new Map((usersResult.data ?? []).map((row) => [row.id, row]));
    const associationsByOrder = associationsResult.data as Record<string, {
      items: Array<Record<string, unknown>>; itemCount: number;
      latestPayment: { id: string; method: string | null; provider: string | null; status: string; amount: number; created_at: string } | null;
      paymentCount: number;
    }>;

    return apiOk({
      orders: orderRows.map((order) => {
        // The embedded relationship exists only to constrain the parent order set.
        // Keep it out of the response; the existing summary RPC owns item output.
        const { order_items: _matchingItems, ...orderData } = order;
        return {
          ...orderData,
          isGuest: order.user_id === null && Boolean(order.guest_subject_id),
          canCorrectGuestContact,
          customer: (() => {
            const customer = usersById.get(order.user_id);
            return { name: customer?.full_name ?? order.contact_name ?? "Guest", email: customer?.email ?? order.contact_email ?? null };
          })(),
          items: associationsByOrder[order.id]?.items ?? [],
          itemCount: associationsByOrder[order.id]?.itemCount ?? 0,
          itemsHasMore: (associationsByOrder[order.id]?.itemCount ?? 0) > 3,
          payments: associationsByOrder[order.id]?.latestPayment ? [associationsByOrder[order.id].latestPayment] : [],
          paymentCount: associationsByOrder[order.id]?.paymentCount ?? 0,
          paymentsHasMore: (associationsByOrder[order.id]?.paymentCount ?? 0) > 1,
          payment: associationsByOrder[order.id]?.latestPayment ?? null,
        };
      }),
      page,
      pageSize: PAGE_SIZE,
      total: count ?? 0,
      canCorrectGuestContact,
    });
  } catch {
    return apiFail('ORDERS_UNAVAILABLE', 'Unable to load orders right now.', 503);
  }
}

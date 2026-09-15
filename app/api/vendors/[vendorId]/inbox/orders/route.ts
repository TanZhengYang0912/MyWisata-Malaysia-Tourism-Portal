// P4 — GET /api/vendors/[vendorId]/inbox/orders?customerId=... — the orders a
// vendor can attach to a chat as a Booking-Confirmation card: this customer's
// orders that include an item from one of the vendor's outlets, newest first.

import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string }> }

export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const { serviceDb: service, outletIds } = access.access;
  if (!outletIds.length) return apiOk([]);

  const customerId = new URL(request.url).searchParams.get('customerId');
  if (!customerId) return apiFail('VALIDATION_FAILED', 'customerId is required', 422);

  const { data: itemRows, error: itemsError } = await service
    .from('order_items')
    .select('order_id, product_name, quantity, outlet_id, orders!inner(id, display_id, status, total_amount, user_id, created_at)')
    .in('outlet_id', outletIds)
    .eq('orders.user_id', customerId);
  if (itemsError) return apiFail('DB_ERROR', itemsError.message, 500);

  type OrderEmbed = { id: string; display_id: string | null; status: string; total_amount: number; created_at: string };
  type ItemRow = { product_name: string; quantity: number; orders: OrderEmbed | OrderEmbed[] | null };
  const byOrder = new Map<string, { id: string; displayId: string | null; status: string; totalAmount: number; createdAt: string; items: string[] }>();
  for (const row of (itemRows ?? []) as unknown as ItemRow[]) {
    const o = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    if (!o) continue;
    const entry = byOrder.get(o.id) ?? { id: o.id, displayId: o.display_id, status: o.status, totalAmount: Number(o.total_amount), createdAt: o.created_at, items: [] };
    entry.items.push(row.product_name);
    byOrder.set(o.id, entry);
  }

  const orders = [...byOrder.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 30);
  return apiOk(orders);
}

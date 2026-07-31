import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { aggregateVoucherAnalytics } from '@/lib/vendor/voucher-analytics';

interface Props { params: Promise<{ vendorId: string }> }
type RedemptionRow = { voucher_id: string; user_id: string | null; discount: number | null; created_at: string; orders: { id?: string; total_amount: number | null } | null };
type VoucherRow = { id: string; code: string; name: string; max_uses: number | null; outlet_id: string | null; outlets: { name: string } | { name: string }[] | null };
type EventRow = { voucher_id: string; user_id: string | null; event_type: string };

export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const url = new URL(request.url);
  const outletId = url.searchParams.get('outletId');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (outletId && access.access.isOutletManager && !access.access.outletIds.includes(outletId)) return apiFail('FORBIDDEN', 'This outlet is outside your assigned scope', 403);
  if (outletId && !access.access.outletIds.includes(outletId)) return apiFail('FORBIDDEN', 'This outlet is outside your vendor scope', 403);

  const db = access.access.serviceDb;
  let voucherQuery = db.from('vouchers').select('id,code,name,max_uses,outlet_id,outlets(name)').eq('vendor_id', vendorId).order('created_at', { ascending: false });
  if (outletId) voucherQuery = voucherQuery.or(`outlet_id.eq.${outletId},outlet_id.is.null`);
  const { data: vouchers, error: voucherError } = await voucherQuery;
  if (voucherError) return apiFail('DB_ERROR', voucherError.message, 500);
  const voucherRows = (vouchers || []) as VoucherRow[];
  const voucherIds = voucherRows.map((voucher: any) => voucher.id);
  let eventQuery = db.from('voucher_events').select('voucher_id,user_id,event_type').in('voucher_id', voucherIds.length ? voucherIds : ['none']);
  if (from) eventQuery = eventQuery.gte('created_at', `${from}T00:00:00+08:00`);
  if (to) eventQuery = eventQuery.lte('created_at', `${to}T23:59:59.999+08:00`);
  const { data: eventRows, error: eventError } = await eventQuery;
  if (eventError) return apiFail('DB_ERROR', eventError.message, 500);
  const orderIds = new Set<string>();
  let redemptionQuery = db.from('voucher_redemptions').select('voucher_id,user_id,discount,created_at,orders(id,total_amount)').in('voucher_id', voucherIds.length ? voucherIds : ['none']).order('created_at', { ascending: false });
  if (from) redemptionQuery = redemptionQuery.gte('created_at', `${from}T00:00:00+08:00`);
  if (to) redemptionQuery = redemptionQuery.lte('created_at', `${to}T23:59:59.999+08:00`);
  const { data, error } = await redemptionQuery;
  if (error) return apiFail('DB_ERROR', error.message, 500);
  for (const row of (data ?? []) as unknown as RedemptionRow[]) if (row.orders?.id) orderIds.add(row.orders.id);
  let allowedOrderIds: Set<string> | null = null;
  if (outletId && orderIds.size) {
    const { data: orderItems, error: itemError } = await db.from('order_items').select('order_id').in('order_id', [...orderIds]).eq('outlet_id', outletId);
    if (itemError) return apiFail('DB_ERROR', itemError.message, 500);
    allowedOrderIds = new Set((orderItems || []).map((item: any) => item.order_id));
  }
  const filteredRedemptions = ((data ?? []) as unknown as RedemptionRow[]).filter((row) => !allowedOrderIds || allowedOrderIds.has(row.orders?.id || ''));
  const analytics = aggregateVoucherAnalytics(
    voucherRows.map((voucher) => {
      const outlet = Array.isArray(voucher.outlets) ? voucher.outlets[0] : voucher.outlets;
      return { id: voucher.id, code: voucher.code, name: voucher.name, maxUses: voucher.max_uses, outletName: outlet?.name || 'All outlets' };
    }),
    ((eventRows ?? []) as EventRow[]).map((event) => ({ voucherId: event.voucher_id, eventType: event.event_type, userId: event.user_id })),
    filteredRedemptions.map((row) => ({ voucherId: row.voucher_id, discount: row.discount, revenue: row.orders?.total_amount ?? 0, userId: row.user_id })),
  );
  return apiOk(analytics);
}

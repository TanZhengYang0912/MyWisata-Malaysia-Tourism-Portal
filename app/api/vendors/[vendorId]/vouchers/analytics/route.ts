import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string }> }
type RedemptionRow = { voucher_id: string; discount: number | null; vouchers: { code: string; name: string; max_uses: number | null } | null; orders: { total_amount: number | null } | null };

export async function GET(_request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const { data, error } = await access.access.serviceDb.from('voucher_redemptions').select('voucher_id,discount,vouchers!inner(vendor_id,code,name,max_uses),orders(total_amount)').eq('vouchers.vendor_id', vendorId);
  if (error) return apiFail('DB_ERROR', error.message, 500);
  const analytics = new Map<string, { voucherId: string; code: string; name: string; redemptions: number; redemptionRate: number | null; discount: number; revenue: number }>();
  for (const row of (data ?? []) as unknown as RedemptionRow[]) {
    const voucher = row.vouchers;
    if (!voucher) continue;
    const current = analytics.get(row.voucher_id) || { voucherId: row.voucher_id, code: voucher.code, name: voucher.name, redemptions: 0, redemptionRate: voucher.max_uses ? 0 : null, discount: 0, revenue: 0 };
    current.redemptions += 1;
    current.redemptionRate = voucher.max_uses ? Number(((current.redemptions / voucher.max_uses) * 100).toFixed(1)) : null;
    current.discount += Number(row.discount || 0);
    current.revenue += Number(row.orders?.total_amount || 0);
    analytics.set(row.voucher_id, current);
  }
  return apiOk(Array.from(analytics.values()).sort((a, b) => b.redemptions - a.redemptions));
}

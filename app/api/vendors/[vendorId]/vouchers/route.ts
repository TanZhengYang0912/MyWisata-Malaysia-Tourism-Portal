// P2 — Member 2: Voucher CRUD (B3)

import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { voucherCreateSchema } from '@/lib/validation/vendor-schemas';
import { outletShortName } from '@/lib/outlet-display';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string }> }

export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '10', 10) || 10));
  const q = (url.searchParams.get('q') || '').trim().replace(/[%(),]/g, ' ');
  const statusFilter = url.searchParams.get('status') || 'all';

  let query = supabase.from('vouchers').select('*, outlets(id,name,city,state)', { count: 'exact' }).eq('vendor_id', vendorId).order('created_at', { ascending: false });
  if (access.access.isOutletManager) query = query.in('outlet_id', access.access.outletIds);
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  const { data, error } = await query;

  if (error) return apiFail('DB_ERROR', error.message, 500);
  const now = Date.now();
  const withStatus = (data ?? []).map((voucher: any) => {
    if (voucher.review_status && voucher.review_status !== 'approved') return { ...voucher, outlets: voucher.outlets ? { ...voucher.outlets, full_name: voucher.outlets.name, name: outletShortName(voucher.outlets.name) } : voucher.outlets, status: voucher.review_status };
    const validFrom = voucher.valid_from ? new Date(voucher.valid_from).getTime() : null;
    const validUntil = voucher.valid_until ? new Date(voucher.valid_until).getTime() : null;
    const status = !voucher.is_active ? 'inactive' : validFrom && validFrom > now ? 'scheduled' : validUntil && validUntil < now ? 'expired' : voucher.max_uses && voucher.uses_count >= voucher.max_uses ? 'expired' : 'active';
    return { ...voucher, outlets: voucher.outlets ? { ...voucher.outlets, full_name: voucher.outlets.name, name: outletShortName(voucher.outlets.name) } : voucher.outlets, status };
  }).filter((voucher: any) => statusFilter === 'all' || voucher.status === statusFilter);
  const start = (page - 1) * pageSize;
  const items = withStatus.slice(start, start + pageSize);
  const stats = withStatus.reduce((result: Record<string, number>, voucher: any) => {
    result[voucher.status] = (result[voucher.status] || 0) + 1;
    return result;
  }, {});
  return apiOk({ items, stats, pagination: { page, pageSize, total: withStatus.length, totalPages: Math.max(1, Math.ceil(withStatus.length / pageSize)) } });
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;

  const { data: vendor } = await supabase
    .from('vendors')
    .select('owner_id, status')
    .eq('id', vendorId)
    .single();
  if (!vendor) return apiFail('FORBIDDEN', 'Not your vendor', 403);
  if (vendor.status !== 'approved') return apiFail('INVALID_STATE', 'Vendor not approved', 400);

  const parsed = await parseBody(request, voucherCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // If outlet specified, verify it belongs to vendor
  if (body.outletId) {
    const { data: outlet } = await supabase
      .from('outlets')
      .select('id')
      .eq('id', body.outletId)
      .eq('vendor_id', vendorId)
      .single();
    if (!outlet) return apiFail('INVALID_OUTLET', 'Outlet not found or not owned by this vendor', 400);
  }

  if (body.voucherType === 'bogo') {
    const { data: product } = await supabase.from('products').select('id').eq('id', body.productId).eq('vendor_id', vendorId).maybeSingle();
    if (!product) return apiFail('INVALID_PRODUCT', 'BOGO product not found for this vendor', 400);
  }

  const { data, error } = await supabase.from('vouchers').insert({
    vendor_id: vendorId,
    outlet_id: body.outletId ?? null,
    code: body.code,
    name: body.name,
    voucher_type: body.voucherType,
    discount_value: body.discountValue ?? 0,
    min_spend: body.minSpend,
    max_uses: body.maxUses ?? null,
    valid_from: body.validFrom ?? null,
    valid_until: body.validUntil ?? null,
    product_id: body.productId ?? null,
    buy_quantity: body.buyQuantity ?? null,
    free_quantity: body.freeQuantity ?? null,
    is_active: false,
    review_status: 'pending_review',
  }).select().single();

  if (error) {
    if (error.message.includes('unique') || error.message.includes('duplicate')) {
      return apiFail('CODE_TAKEN', `Voucher code "${body.code}" is already in use`, 409);
    }
    return apiFail('DB_ERROR', error.message, 400);
  }
  return apiOk(data, { status: 201 });
}

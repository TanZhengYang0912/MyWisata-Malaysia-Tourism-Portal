import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string }> }

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => ({})) as { csv?: unknown };
  if (typeof body.csv !== 'string' || body.csv.trim().length < 10) return apiFail('INVALID_CSV', 'Upload a CSV with a header row and at least one voucher.', 400);
  const rows = body.csv.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(',').map((value) => value.trim().replace(/^"|"$/g, '')));
  const headers = rows.shift()?.map((header) => header.toLowerCase()) || [];
  const index = (name: string) => headers.indexOf(name);
  const records = rows.map((row) => {
    const voucherType = row[index('vouchertype')] || row[index('voucher_type')] || 'fixed';
    const discountValue = Number(row[index('discountvalue')] || row[index('discount_value')] || 0);
    return { vendor_id: vendorId, code: row[index('code')]?.toUpperCase(), name: row[index('name')] || row[index('code')], voucher_type: voucherType, discount_value: discountValue, min_spend: Number(row[index('minspend')] || row[index('min_spend')] || 0), max_uses: row[index('maxuses')] || row[index('max_uses')] ? Number(row[index('maxuses')] || row[index('max_uses')]) : null, valid_from: row[index('validfrom')] || row[index('valid_from')] || null, valid_until: row[index('validuntil')] || row[index('valid_until')] || null, product_id: row[index('productid')] || row[index('product_id')] || null, buy_quantity: Number(row[index('buyquantity')] || row[index('buy_quantity')] || 0) || null, free_quantity: Number(row[index('freequantity')] || row[index('free_quantity')] || 0) || null, is_active: false, review_status: 'pending_review' };
  }).filter((record) => record.code && record.name && (record.voucher_type === 'bogo' ? record.product_id && record.buy_quantity && record.free_quantity : record.discount_value > 0));
  if (records.length === 0) return apiFail('INVALID_CSV', 'No valid voucher rows found.', 400);
  const { data, error } = await access.access.serviceDb.from('vouchers').insert(records).select('id,code');
  if (error) return apiFail('DB_ERROR', error.message, 400);
  return apiOk({ inserted: data?.length || 0, items: data || [] }, { status: 201 });
}

import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string }> }

function parseCsv(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim()); cell = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => ({})) as { csv?: unknown };
  if (typeof body.csv !== 'string' || body.csv.trim().length < 10) return apiFail('INVALID_CSV', 'Upload a CSV with a header row and at least one voucher.', 400);
  const rows = parseCsv(body.csv.trim());
  const headers = rows.shift()?.map((header) => header.toLowerCase()) || [];
  const index = (name: string) => headers.indexOf(name);
  const parsedRows = rows.map((row, rowIndex) => {
    const voucherType = row[index('vouchertype')] || row[index('voucher_type')] || 'fixed';
    const discountValue = Number(row[index('discountvalue')] || row[index('discount_value')] || 0);
    const code = row[index('code')]?.trim().toUpperCase() || '';
    const name = row[index('name')]?.trim() || code;
    const perCustomerLimit = row[index('percustomerlimit')] || row[index('per_customer_limit')];
    const outletId = row[index('outletid')] || row[index('outlet_id')] || null;
    const maxUsesRaw = row[index('maxuses')] || row[index('max_uses')];
    const maxUses = maxUsesRaw ? Number(maxUsesRaw) : null;
    const errors: string[] = [];
    if (!code) errors.push('missing code');
    if (code.length > 50) errors.push('code is longer than 50 characters');
    if (!name) errors.push('missing name');
    if (!['fixed', 'percent', 'bogo'].includes(voucherType)) errors.push('invalid voucher type');
    if (voucherType !== 'bogo' && (!Number.isFinite(discountValue) || discountValue <= 0)) errors.push('discount must be positive');
    if (voucherType === 'percent' && discountValue > 100) errors.push('percent discount cannot exceed 100');
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) errors.push('max uses must be a positive integer');
    if (perCustomerLimit && (!Number.isInteger(Number(perCustomerLimit)) || Number(perCustomerLimit) < 1)) errors.push('per customer limit must be a positive integer');
    const productId = row[index('productid')] || row[index('product_id')] || null;
    const buyQuantity = Number(row[index('buyquantity')] || row[index('buy_quantity')] || 0) || null;
    const freeQuantity = Number(row[index('freequantity')] || row[index('free_quantity')] || 0) || null;
    if (voucherType === 'bogo' && (!productId || !buyQuantity || !freeQuantity)) errors.push('BOGO requires product, buy quantity and free quantity');
    return {
      rowNumber: rowIndex + 2,
      errors,
      record: { vendor_id: vendorId, code, name, voucher_type: voucherType, discount_value: discountValue, min_spend: Number(row[index('minspend')] || row[index('min_spend')] || 0), max_uses: maxUses, per_customer_limit: perCustomerLimit ? Number(perCustomerLimit) : null, valid_from: row[index('validfrom')] || row[index('valid_from')] || null, valid_until: row[index('validuntil')] || row[index('valid_until')] || null, outlet_id: outletId, product_id: productId, buy_quantity: buyQuantity, free_quantity: freeQuantity, is_active: false, review_status: 'pending_review' },
    };
  });
  const seenCodes = new Set<string>();
  const candidates = parsedRows.filter((item) => {
    if (item.errors.length || seenCodes.has(item.record.code)) {
      if (seenCodes.has(item.record.code)) item.errors.push('duplicate code in CSV');
      return false;
    }
    seenCodes.add(item.record.code);
    return true;
  });
  const { data: existingCodes } = candidates.length
    ? await access.access.serviceDb.from('vouchers').select('code').eq('vendor_id', vendorId).in('code', candidates.map((item) => item.record.code))
    : { data: [] as { code: string }[] };
  const existing = new Set((existingCodes ?? []).map((item) => item.code.toUpperCase()));
  candidates.forEach((item) => { if (existing.has(item.record.code)) item.errors.push('code already exists'); });
  const records = candidates.filter((item) => item.errors.length === 0).map((item) => item.record);
  const failed = parsedRows.filter((item) => item.errors.length > 0).map((item) => ({ row: item.rowNumber, errors: item.errors }));
  if (records.length === 0) return apiFail('INVALID_CSV', 'No valid voucher rows found.', 400, { failed });
  const { data, error } = await access.access.serviceDb.from('vouchers').insert(records).select('id,code');
  if (error) return apiFail('DB_ERROR', error.message, 400);
  return apiOk({ inserted: data?.length || 0, failed, items: data || [] }, { status: 201 });
}

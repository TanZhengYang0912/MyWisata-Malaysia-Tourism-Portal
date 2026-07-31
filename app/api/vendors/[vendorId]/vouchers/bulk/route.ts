import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { allocateVoucherCodes, parseVoucherCsv } from '@/lib/vendor/voucher-csv';

interface Props { params: Promise<{ vendorId: string }> }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function csvDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => ({})) as { csv?: unknown; codePrefix?: unknown };
  if (typeof body.csv !== 'string' || body.csv.trim().length < 10) return apiFail('INVALID_CSV', 'Upload a CSV with a header row and at least one voucher.', 400);
  const codePrefix = typeof body.codePrefix === 'string' ? body.codePrefix.trim().toUpperCase() : '';
  if (codePrefix && !/^[A-Z0-9]{2,20}$/.test(codePrefix)) return apiFail('INVALID_CODE_PREFIX', 'Code prefix must contain 2-20 letters or numbers.', 400);
  const rows = parseVoucherCsv(body.csv.trim());
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
    if (!code && !codePrefix) errors.push('missing code (provide codePrefix to auto-generate)');
    if (code.length > 50) errors.push('code is longer than 50 characters');
    if (!name) errors.push('missing name');
    if (!['fixed', 'percent', 'bogo'].includes(voucherType)) errors.push('invalid voucher type');
    if (voucherType !== 'bogo' && (!Number.isFinite(discountValue) || discountValue <= 0)) errors.push('discount must be positive');
    if (voucherType === 'percent' && discountValue > 100) errors.push('percent discount cannot exceed 100');
    const minSpend = Number(row[index('minspend')] || row[index('min_spend')] || 0);
    if (!Number.isFinite(minSpend) || minSpend < 0) errors.push('minimum spend must be a non-negative number');
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) errors.push('max uses must be a positive integer');
    if (perCustomerLimit && (!Number.isInteger(Number(perCustomerLimit)) || Number(perCustomerLimit) < 1)) errors.push('per customer limit must be a positive integer');
    const productId = row[index('productid')] || row[index('product_id')] || null;
    const buyQuantity = Number(row[index('buyquantity')] || row[index('buy_quantity')] || 0) || null;
    const freeQuantity = Number(row[index('freequantity')] || row[index('free_quantity')] || 0) || null;
    if (productId && !uuidPattern.test(productId)) errors.push('product id must be a valid UUID');
    if (outletId && !uuidPattern.test(outletId)) errors.push('outlet id must be a valid UUID');
    if (voucherType === 'bogo' && (!productId || !buyQuantity || !freeQuantity)) errors.push('BOGO requires product, buy quantity and free quantity');
    const validFrom = csvDate(row[index('validfrom')] || row[index('valid_from')]);
    const validUntil = csvDate(row[index('validuntil')] || row[index('valid_until')]);
    if ((row[index('validfrom')] || row[index('valid_from')]) && !validFrom) errors.push('valid from must be a valid date');
    if ((row[index('validuntil')] || row[index('valid_until')]) && !validUntil) errors.push('valid until must be a valid date');
    if (validFrom && validUntil && new Date(validUntil) <= new Date(validFrom)) errors.push('valid until must be after valid from');
    return {
      rowNumber: rowIndex + 2,
      errors,
      generated: !code && Boolean(codePrefix),
      record: { vendor_id: vendorId, code, name, voucher_type: voucherType, discount_value: discountValue, min_spend: minSpend, max_uses: maxUses, per_customer_limit: perCustomerLimit ? Number(perCustomerLimit) : null, valid_from: validFrom, valid_until: validUntil, outlet_id: outletId, product_id: productId, buy_quantity: buyQuantity, free_quantity: freeQuantity, is_active: false, review_status: 'pending_review' },
    };
  });

  const generatedRows = parsedRows.filter((item) => item.generated && item.errors.length === 0);
  const { data: existingCodes, error: existingCodesError } = await access.access.serviceDb.from('vouchers').select('code').eq('vendor_id', vendorId);
  if (existingCodesError) return apiFail('DB_ERROR', 'Could not check existing voucher codes.', 500);
  const existingCodeSet = new Set((existingCodes ?? []).map((item) => item.code.toUpperCase()));
  const knownCodes = new Set(existingCodeSet);
  parsedRows.filter((item) => !item.generated && item.record.code).forEach((item) => knownCodes.add(item.record.code));
  let nextSequence = 1;
  const assignGeneratedCodes = () => {
    const generatedCodes = allocateVoucherCodes(codePrefix, generatedRows.length, knownCodes, nextSequence);
    generatedRows.forEach((item, index) => {
      item.record.code = generatedCodes[index];
      knownCodes.add(item.record.code);
      nextSequence = Math.max(nextSequence, Number(item.record.code.slice(codePrefix.length)) + 1);
    });
  };
  assignGeneratedCodes();

  const outletIds = [...new Set(parsedRows.map((item) => item.record.outlet_id).filter(Boolean))];
  const productIds = [...new Set(parsedRows.map((item) => item.record.product_id).filter(Boolean))];
  const [{ data: outlets }, { data: products }] = await Promise.all([
    outletIds.length ? access.access.serviceDb.from('outlets').select('id').eq('vendor_id', vendorId).in('id', outletIds) : Promise.resolve({ data: [] as { id: string }[] }),
    productIds.length ? access.access.serviceDb.from('products').select('id').eq('vendor_id', vendorId).in('id', productIds) : Promise.resolve({ data: [] as { id: string }[] }),
  ]);
  const validOutletIds = new Set((outlets ?? []).map((item) => item.id));
  const validProductIds = new Set((products ?? []).map((item) => item.id));
  parsedRows.forEach((item) => {
    if (item.record.outlet_id && !validOutletIds.has(item.record.outlet_id)) item.errors.push('outlet is not owned by this vendor');
    if (item.record.product_id && !validProductIds.has(item.record.product_id)) item.errors.push('product is not owned by this vendor');
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
  candidates.forEach((item) => { if (existingCodeSet.has(item.record.code) && !item.generated) item.errors.push('code already exists'); });
  const records = candidates.filter((item) => item.errors.length === 0).map((item) => item.record);
  const failed = parsedRows.filter((item) => item.errors.length > 0).map((item) => ({ row: item.rowNumber, errors: item.errors }));
  if (records.length === 0) return apiFail('INVALID_CSV', 'No valid voucher rows found.', 400, { failed });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await access.access.serviceDb.from('vouchers').insert(records).select('id,code');
    if (!error) return apiOk({ inserted: data?.length || 0, failed, items: data || [], generated: generatedRows.length }, { status: 201 });
    if (!generatedRows.length || !error.message.toLowerCase().includes('duplicate') && !error.message.toLowerCase().includes('unique')) return apiFail('DB_ERROR', error.message, 400);
    assignGeneratedCodes();
  }
  return apiFail('CODE_GENERATION_FAILED', 'Could not allocate unique voucher codes. Try the upload again.', 409);
}

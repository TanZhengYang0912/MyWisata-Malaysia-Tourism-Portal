import { localDateTimeToIso } from '@/lib/vendor/voucher-form-values';
import { makeVoucherCode } from '@/lib/vendor/voucher-csv';

export const voucherCsvHeaders = [
  'code', 'name', 'voucherType', 'discountValue', 'minSpend', 'maxUses',
  'perCustomerLimit', 'validFrom', 'validUntil', 'outletId', 'productId',
  'buyQuantity', 'freeQuantity',
] as const;

export type VoucherCsvDraft = {
  code: string;
  name: string;
  voucherType: 'fixed' | 'percent' | 'bogo';
  discountValue: string;
  minSpend: string;
  maxUses: string;
  perCustomerLimit: string;
  validFrom: string;
  validUntil: string;
  outletId: string;
  productId: string;
  buyQuantity: string;
  freeQuantity: string;
};

export function emptyVoucherCsvDraft(): VoucherCsvDraft {
  return {
    code: '', name: '', voucherType: 'fixed', discountValue: '', minSpend: '0', maxUses: '',
    perCustomerLimit: '', validFrom: '', validUntil: '', outletId: '', productId: '',
    buyQuantity: '', freeQuantity: '',
  };
}

export function validateVoucherCsvDrafts(rows: VoucherCsvDraft[]) {
  const errors: Record<number, string[]> = {};
  rows.forEach((row, index) => {
    const rowErrors: string[] = [];
    if (row.name.trim().length < 2) rowErrors.push('Add a voucher name.');
    const discount = Number(row.discountValue);
    if (row.voucherType !== 'bogo' && (!Number.isFinite(discount) || discount <= 0)) rowErrors.push('Enter a positive discount value.');
    if (row.voucherType === 'percent' && discount > 100) rowErrors.push('Percentage discount cannot exceed 100.');
    if (row.voucherType === 'bogo') {
      if (!row.productId) rowErrors.push('Choose an eligible product for BOGO.');
      if (!Number.isInteger(Number(row.buyQuantity)) || Number(row.buyQuantity) < 1) rowErrors.push('Enter a buy quantity.');
      if (!Number.isInteger(Number(row.freeQuantity)) || Number(row.freeQuantity) < 1) rowErrors.push('Enter a free quantity.');
    }
    if (row.validFrom && row.validUntil) {
      const from = localDateTimeToIso(row.validFrom);
      const until = localDateTimeToIso(row.validUntil);
      if (!from || !until || new Date(until) <= new Date(from)) rowErrors.push('Valid until must be after valid from.');
    }
    if (rowErrors.length) errors[index] = rowErrors;
  });
  return errors;
}

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildVoucherCsv(rows: VoucherCsvDraft[]) {
  const lines = [voucherCsvHeaders.join(',')];
  for (const row of rows) {
    lines.push([
      row.code,
      row.name,
      row.voucherType,
      row.discountValue,
      row.minSpend,
      row.maxUses,
      row.perCustomerLimit,
      row.validFrom ? localDateTimeToIso(row.validFrom) || row.validFrom : '',
      row.validUntil ? localDateTimeToIso(row.validUntil) || row.validUntil : '',
      row.outletId,
      row.productId,
      row.buyQuantity,
      row.freeQuantity,
    ].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function previewVoucherCodes(rows: VoucherCsvDraft[], prefix: string) {
  let sequence = 1;
  let generated = 0;
  const sampleCodes = rows.map((row) => {
    if (row.code.trim()) return row.code.trim().toUpperCase();
    generated += 1;
    const code = makeVoucherCode(prefix, sequence);
    sequence += 1;
    return code;
  });
  return { generated, sampleCodes };
}

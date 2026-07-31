import { validateVoucherCsvDrafts, type VoucherCsvDraft } from '@/lib/vendor/voucher-csv-builder';

export type VoucherCsvDraftDocument = {
  title: string;
  rows: VoucherCsvDraft[];
  autoGenerate: boolean;
  codePrefix: string;
};

export type VoucherCsvDraftSummary = {
  total: number;
  valid: number;
  errors: number;
  blankCodes: number;
};

export function normalizeVoucherCsvDraft(document: VoucherCsvDraftDocument): VoucherCsvDraftDocument {
  return {
    title: document.title.trim(),
    rows: document.rows.map((row) => ({ ...row, name: row.name.trim(), code: row.code.trim().toUpperCase() })),
    autoGenerate: Boolean(document.autoGenerate),
    codePrefix: document.codePrefix.trim().toUpperCase(),
  };
}

export function summarizeVoucherCsvDraft(document: VoucherCsvDraftDocument): VoucherCsvDraftSummary {
  const errors = validateVoucherCsvDrafts(document.rows);
  return {
    total: document.rows.length,
    valid: document.rows.length - Object.keys(errors).length,
    errors: Object.keys(errors).length,
    blankCodes: document.rows.filter((row) => !row.code.trim()).length,
  };
}

export function getVoucherCsvDraftBlockingError(document: VoucherCsvDraftDocument) {
  const rowErrors = validateVoucherCsvDrafts(document.rows);
  if (Object.keys(rowErrors).length) return 'Fix the highlighted rows before previewing this batch.';
  const blankCodes = document.rows.some((row) => !row.code.trim());
  if (blankCodes && !document.autoGenerate) return 'Add a code or enable automatic code generation.';
  if (blankCodes && !/^[A-Z0-9]{2,20}$/.test(document.codePrefix)) return 'Add a 2–20 character prefix before generating blank codes.';
  return null;
}

export function getVoucherCsvDraftStorageKey(vendorId: string, draftId: string) {
  return `voucher-csv-draft:${encodeURIComponent(vendorId)}:${encodeURIComponent(draftId)}`;
}

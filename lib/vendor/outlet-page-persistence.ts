import {
  normalizeOutletPageDocument,
  type LegacyOutletPageFields,
  type OutletPageDocument,
} from '@/lib/vendor/outlet-page-schema';

export interface LegacyOrLifecyclePageRow extends LegacyOutletPageFields {
  draft_document?: unknown;
  published_document?: unknown;
}

export function selectDraftDocument(row: LegacyOrLifecyclePageRow): OutletPageDocument {
  return normalizeOutletPageDocument(row.draft_document || row, row);
}

export function selectPublicDocument(row: LegacyOrLifecyclePageRow): OutletPageDocument {
  return normalizeOutletPageDocument(row.published_document || row, row);
}

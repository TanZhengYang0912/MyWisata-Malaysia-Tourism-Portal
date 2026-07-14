export const KYC_DOCUMENT_SIDES = ['front', 'back'] as const;
export type KycDocumentSide = (typeof KYC_DOCUMENT_SIDES)[number];

export const KYC_REVIEW_REASON_CODES = [
  'document_unreadable',
  'document_incomplete',
  'document_mismatch',
  'document_expired',
  'document_suspected_tampering',
  'other',
] as const;

export type KycReviewReasonCode = (typeof KYC_REVIEW_REASON_CODES)[number];
export type KycReviewAction = 'reject' | 'request_info';

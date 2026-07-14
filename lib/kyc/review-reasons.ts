import { KYC_REVIEW_REASON_CODES, type KycReviewAction, type KycReviewReasonCode } from './types';

const INFORMATION_REQUEST_REASONS = new Set<KycReviewReasonCode>([
  'document_unreadable',
  'document_incomplete',
  'document_mismatch',
  'document_expired',
  'other',
]);

export type ReviewReasonValidation =
  | { ok: true }
  | { ok: false; error: 'reason_code_not_allowed' | 'reason_detail_not_allowed' | 'reason_detail_too_short' };

export function validateReviewReason(
  action: KycReviewAction,
  reasonCode: KycReviewReasonCode,
  reasonDetail: string | null,
): ReviewReasonValidation {
  if (!KYC_REVIEW_REASON_CODES.includes(reasonCode)) {
    return { ok: false, error: 'reason_code_not_allowed' };
  }

  if (action === 'request_info' && !INFORMATION_REQUEST_REASONS.has(reasonCode)) {
    return { ok: false, error: 'reason_code_not_allowed' };
  }

  if (reasonCode !== 'other' && reasonDetail !== null) {
    return { ok: false, error: 'reason_detail_not_allowed' };
  }

  if (reasonCode === 'other' && (reasonDetail?.trim().length ?? 0) < 10) {
    return { ok: false, error: 'reason_detail_too_short' };
  }

  return { ok: true };
}

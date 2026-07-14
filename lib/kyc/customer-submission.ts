import type { CustomerKycSubmission, KycSubmissionStatus } from '@/backend/core/types';
import type { KycReviewReasonCode } from './types';

type CustomerSubmissionRow = {
  [key: string]: unknown;
  id: string;
  status: string;
  document_type: string | null;
  queue_position: number | null;
  created_at: string;
  reviewed_at: string | null;
  review_reason_code: string | null;
  review_reason_detail: string | null;
};

const SAFE_REASON_COPY: Record<KycReviewReasonCode, string> = {
  document_unreadable: 'We could not clearly read your document. Please submit clear, well-lit images.',
  document_incomplete: 'Your document submission appears incomplete. Please include both required sides.',
  document_mismatch: 'The document details could not be matched. Please check that the document belongs to you.',
  document_expired: 'Your document appears to be expired. Please submit a current, valid document.',
  document_suspected_tampering: 'We could not complete verification with this submission. Please contact support if you need help.',
  other: 'We need more information to complete verification. Please review the reviewer note below.',
};

function isStatus(status: string): status is KycSubmissionStatus {
  return ['draft', 'pending', 'info_requested', 'approved', 'rejected', 'superseded'].includes(status);
}

function isReasonCode(reason: string | null | undefined): reason is KycReviewReasonCode {
  return !!reason && Object.hasOwn(SAFE_REASON_COPY, reason);
}

export function safeKycReasonCopy(reasonCode: string | null | undefined): string {
  return isReasonCode(reasonCode)
    ? SAFE_REASON_COPY[reasonCode]
    : 'We could not complete verification with this submission. Please review your documents and submit a new one.';
}

export function mapCustomerKycSubmission(row: CustomerSubmissionRow): CustomerKycSubmission {
  return {
    id: row.id,
    status: isStatus(row.status) ? row.status : 'pending',
    docType: row.document_type ?? 'national_id',
    queuePosition: row.queue_position,
    submittedAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewReasonCode: isReasonCode(row.review_reason_code) ? row.review_reason_code : null,
    reviewReasonDetail: row.review_reason_detail,
  };
}

import type { AdminKycSubmission } from '@/backend/core/types';

export const ADMIN_KYC_SUBMISSION_SELECT = 'id,user_id,document_type,status,queue_position,created_at,reviewed_at,reviewer_id,review_reason_code,review_reason_detail,kyc_submission_documents(side),kyc_ocr_results(status,holder_name,document_number_last4,expiry_date,confidence,mismatch_fields,processed_at)';

export type AdminKycSubmissionRow = {
  id: string;
  user_id: string;
  document_type: string | null;
  status: string;
  queue_position: number | null;
  created_at: string;
  reviewed_at: string | null;
  reviewer_id: string | null;
  review_reason_code: string | null;
  review_reason_detail: string | null;
  kyc_submission_documents?: { side: 'front' | 'back' }[] | null;
  kyc_ocr_results?: {
    status: NonNullable<AdminKycSubmission['ocr']>['status'];
    holder_name: string | null;
    document_number_last4: string | null;
    expiry_date: string | null;
    confidence: number | null;
    mismatch_fields: string[] | null;
    processed_at: string;
  }[] | null;
};

export function mapAdminKycSubmission(row: AdminKycSubmissionRow): AdminKycSubmission {
  const ocr = row.kyc_ocr_results?.[0];

  return {
    id: row.id,
    userId: row.user_id,
    docType: row.document_type ?? 'national_id',
    status: row.status as AdminKycSubmission['status'],
    queuePosition: row.queue_position ?? null,
    submittedAt: row.created_at,
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewer_id ?? null,
    reviewReasonCode: row.review_reason_code ?? null,
    reviewReasonDetail: row.review_reason_detail ?? null,
    documents: (row.kyc_submission_documents ?? []).map(({ side }) => ({ side })),
    ocr: ocr
      ? {
          status: ocr.status,
          holderName: ocr.holder_name,
          documentNumberLast4: ocr.document_number_last4,
          expiryDate: ocr.expiry_date,
          confidence: ocr.confidence,
          mismatchFields: ocr.mismatch_fields ?? [],
          processedAt: ocr.processed_at,
        }
      : null,
  };
}

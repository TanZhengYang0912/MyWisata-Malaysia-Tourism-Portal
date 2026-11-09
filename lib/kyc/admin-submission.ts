import type { AdminKycSubmission, AdminKycSubmissionDetail } from '@/backend/core/types';

export const ADMIN_KYC_SUBMISSION_SELECT = 'id,user_id,document_type,status,queue_position,created_at,reviewed_at,reviewer_id,review_reason_code,review_reason_detail,kyc_submission_documents(side),kyc_ocr_results(status,holder_name,document_number_last4,expiry_date,confidence,mismatch_fields,issuer_country,nationality,mrz_status,visual_comparison_status,processed_at)';
export const ADMIN_KYC_SUBMISSION_DETAIL_SELECT = `kyc_prescreening_jobs(status,outcome,updated_at),assigned_to,claimed_at,legal_name_snapshot,email_snapshot,phone_snapshot,identity_snapshot_captured_at,${ADMIN_KYC_SUBMISSION_SELECT}`;

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
    issuer_country: string | null;
    nationality: string | null;
    mrz_status: NonNullable<AdminKycSubmission['ocr']>['mrzStatus'];
    visual_comparison_status: NonNullable<AdminKycSubmission['ocr']>['visualComparisonStatus'];
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
          issuerCountry: ocr.issuer_country,
          nationality: ocr.nationality,
          mrzStatus: ocr.mrz_status,
          visualComparisonStatus: ocr.visual_comparison_status,
          processedAt: ocr.processed_at,
        }
      : null,
  };
}

export type AdminKycSubmissionDetailRow = AdminKycSubmissionRow & {
  kyc_prescreening_jobs?: { status: string; outcome: string | null; updated_at: string }[] | null;
  assigned_to: string | null;
  claimed_at: string | null;
  legal_name_snapshot: string | null;
  email_snapshot: string | null;
  phone_snapshot: string | null;
  identity_snapshot_captured_at: string | null;
};

export function mapAdminKycSubmissionDetail(row: AdminKycSubmissionDetailRow): AdminKycSubmissionDetail {
  const precheck = row.kyc_prescreening_jobs?.toSorted((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  return {
    ...mapAdminKycSubmission(row),
    precheck: precheck ? { status: precheck.status, outcome: precheck.outcome, updatedAt: precheck.updated_at } : null,
    assignedTo: row.assigned_to ?? null,
    claimedAt: row.claimed_at ?? null,
    legalIdentity: {
      fullName: row.legal_name_snapshot ?? null,
      email: row.email_snapshot ?? null,
      phone: row.phone_snapshot ?? null,
      capturedAt: row.identity_snapshot_captured_at ?? null,
    },
  };
}

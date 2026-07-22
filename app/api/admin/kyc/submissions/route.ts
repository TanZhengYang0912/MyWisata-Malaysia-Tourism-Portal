import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import type { AdminKycSubmission } from '@/backend/core/types';

export async function GET() {
  const authenticated = await createClient();
  const { data: { user } } = await authenticated.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data: roleRows, error: roleError } = await service
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', user.id);
  type RoleRow = { roles: { name: string } | { name: string }[] | null };
  const roleNames = ((roleRows ?? []) as RoleRow[]).map((r) => {
    const role = Array.isArray(r.roles) ? r.roles[0] : r.roles;
    return role?.name ?? '';
  });
  if (roleError || !roleNames.some((n) => ['admin', 'approver', 'super_admin'].includes(n))) {
    return apiFail('FORBIDDEN', 'Admin role required', 403);
  }

  const { data, error } = await service
    .from('kyc_submissions')
    .select('id,user_id,document_type,status,queue_position,created_at,reviewed_at,reviewer_id,review_reason_code,review_reason_detail,kyc_submission_documents(side),kyc_ocr_results(status,holder_name,document_number_last4,expiry_date,confidence,mismatch_fields,processed_at)')
    .in('status', ['pending', 'info_requested'])
    .order('created_at', { ascending: true });
  if (error) return apiFail('SUBMISSION_LOOKUP_FAILED', 'Unable to load KYC submissions', 500);

  const submissions: AdminKycSubmission[] = (data ?? []).map((row) => ({
    id: row.id, userId: row.user_id, docType: row.document_type ?? 'national_id', status: row.status as AdminKycSubmission['status'],
    queuePosition: row.queue_position ?? null, submittedAt: row.created_at, reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewer_id ?? null, reviewReasonCode: row.review_reason_code ?? null, reviewReasonDetail: row.review_reason_detail ?? null,
    documents: ((row as { kyc_submission_documents?: { side: 'front' | 'back' }[] }).kyc_submission_documents ?? []).map(({ side }) => ({ side })),
    ocr: (() => {
      const ocr = (row as { kyc_ocr_results?: { status: AdminKycSubmission['ocr'] extends infer T ? T extends { status: infer S } ? S : never : never; holder_name: string | null; document_number_last4: string | null; expiry_date: string | null; confidence: number | null; mismatch_fields: string[] | null; processed_at: string }[] }).kyc_ocr_results?.[0];
      return ocr ? { status: ocr.status as NonNullable<AdminKycSubmission['ocr']>['status'], holderName: ocr.holder_name, documentNumberLast4: ocr.document_number_last4, expiryDate: ocr.expiry_date, confidence: ocr.confidence, mismatchFields: ocr.mismatch_fields ?? [], processedAt: ocr.processed_at } : null;
    })(),
  }));
  return apiOk({ submissions });
}

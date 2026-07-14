import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import type { AdminKycSubmission } from '@/backend/core/types';

export async function GET() {
  const authenticated = await createClient();
  const { data: { user } } = await authenticated.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data: roles, error: roleError } = await service.from('user_roles').select('role').eq('user_id', user.id);
  if (roleError || !roles?.some(({ role }) => ['admin', 'approver', 'super_admin'].includes(role))) {
    return apiFail('FORBIDDEN', 'Admin role required', 403);
  }

  const { data, error } = await service
    .from('kyc_submissions')
    .select('id,user_id,document_type,status,queue_position,created_at,reviewed_at,reviewer_id,review_reason_code,review_reason_detail,kyc_submission_documents(side)')
    .in('status', ['pending', 'info_requested'])
    .order('created_at', { ascending: true });
  if (error) return apiFail('SUBMISSION_LOOKUP_FAILED', 'Unable to load KYC submissions', 500);

  const submissions: AdminKycSubmission[] = (data ?? []).map((row) => ({
    id: row.id, userId: row.user_id, docType: row.document_type ?? 'national_id', status: row.status as AdminKycSubmission['status'],
    queuePosition: row.queue_position ?? null, submittedAt: row.created_at, reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewer_id ?? null, reviewReasonCode: row.review_reason_code ?? null, reviewReasonDetail: row.review_reason_detail ?? null,
    documents: ((row as { kyc_submission_documents?: { side: 'front' | 'back' }[] }).kyc_submission_documents ?? []).map(({ side }) => ({ side })),
  }));
  return apiOk({ submissions });
}

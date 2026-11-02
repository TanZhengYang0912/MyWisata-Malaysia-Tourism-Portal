import { requireKycReviewer } from '@/lib/kyc/reviewer-auth';
import { kycWorkSchema } from '@/lib/kyc/operations';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { createServiceClient } from '@/lib/supabase/service';
import type { KycReviewCandidate } from '@/lib/kyc/operations';

type CandidateRow = {
  id: string;
  user_id: string;
  document_type: string;
  created_at: string;
  assigned_to: string | null;
  legal_name_snapshot: string | null;
};

/** Preview only: opening the exact detail URL performs the existing atomic claim. */
export async function GET() {
  const { user, response } = await requireKycReviewer();
  if (response) return response;
  const unavailable = () => {
    const result = apiFail('KYC_CANDIDATE_UNAVAILABLE', 'Unable to load the next KYC applicant', 503);
    result.headers.set('Cache-Control', 'private, no-store');
    return result;
  };
  try {
    const service = createServiceClient();
    const readCandidate = (assigned: boolean) => {
      const query = service.from('kyc_submissions')
        .select('id,user_id,document_type,created_at,assigned_to,legal_name_snapshot')
        .eq('status', 'pending').neq('user_id', user.id);
      return (assigned ? query.eq('assigned_to', user.id) : query.is('assigned_to', null))
        .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(1).maybeSingle<CandidateRow>();
    };
    const own = await readCandidate(true);
    if (own.error) return unavailable();
    const selected = own.data ? own : await readCandidate(false);
    if (selected.error) return unavailable();
    let candidate: KycReviewCandidate | null = null;
    if (selected.data) {
      const row = selected.data;
      let name = row.legal_name_snapshot?.trim() ?? '';
      if (!name) {
        const customer = await service.from('users').select('full_name').eq('id', row.user_id).maybeSingle<{ full_name: string | null }>();
        if (customer.error) return unavailable();
        name = customer.data?.full_name?.trim() ?? '';
      }
      // Never pass through identity numbers, contact details, evidence or assignee IDs.
      candidate = { submissionId: row.id, name, docType: row.document_type, submittedAt: row.created_at,
        isAssignedToCurrentUser: row.assigned_to === user.id };
    }
    const result = apiOk({ candidate });
    result.headers.set('Cache-Control', 'private, no-store');
    return result;
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  const { db, response } = await requireKycReviewer();
  if (response) return response;
  const parsed = await parseBody(request, kycWorkSchema);
  if (!parsed.ok) return parsed.response;
  const { data, error } = await db.rpc('manage_kyc_review_work', {
    p_action: parsed.data.action, p_submission_id: parsed.data.submissionId ?? null,
    p_expected_version: parsed.data.expectedVersion ?? null, p_session_id: parsed.data.sessionId ?? null,
  });
  if (error || !data) return apiFail('KYC_WORK_CONFLICT', 'Unable to update this assignment; reload the queue', 409);
  const result = apiOk(data);
  result.headers.set('Cache-Control', 'private, no-store');
  return result;
}

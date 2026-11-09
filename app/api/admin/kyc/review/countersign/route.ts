import { z } from 'zod';
import { requireKycReviewer } from '@/lib/kyc/reviewer-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { issueKycServiceOperationTicket } from '@/lib/kyc/service-operation-ticket';

const schema = z.object({
  submissionId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  secondaryReviewerId: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
  const { db, user, response } = await requireKycReviewer();
  if (response) return response;
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const ttl = Number(process.env.KYC_REVIEW_CONFIRMATION_TTL_SECONDS);
  if (!Number.isInteger(ttl) || ttl <= 0) return apiFail('KYC_UNAVAILABLE', 'KYC review is temporarily unavailable', 503);

  const ticket = await issueKycServiceOperationTicket(db, {
    submissionId: parsed.data.submissionId,
    action: 'evidence.revision',
    expectedVersion: parsed.data.expectedVersion,
  });
  if (!ticket) return apiFail('KYC_CASE_UNAVAILABLE', 'KYC case is temporarily unavailable', 503);
  const service = createServiceClient();
  const { data: revision, error: revisionError } = await service.rpc('get_kyc_evidence_revision_v2', {
    p_ticket_id: ticket.ticketId,
    p_submission_id: parsed.data.submissionId,
    p_review_version: ticket.reviewVersion,
  });
  if (revisionError || typeof revision !== 'string') return apiFail('KYC_CASE_UNAVAILABLE', 'KYC case is temporarily unavailable', 503);
  const { error } = await db.rpc('authorize_kyc_countersign', {
    p_submission_id: parsed.data.submissionId,
    p_expected_version: parsed.data.expectedVersion,
    p_evidence_revision: revision,
    p_secondary_actor_id: parsed.data.secondaryReviewerId,
    p_ttl_seconds: ttl,
  });
  if (error) {
    const message = error.message ?? '';
    if (message.includes('kyc_countersign_not_authorized') || message.includes('kyc_assignment_changed')) return apiFail('CONFLICT', 'The second reviewer could not be assigned to this case', 409);
    return apiFail('COUNTERSIGN_UNAVAILABLE', 'Second review could not be assigned', 500);
  }
  return apiOk({ authorized: true });
}

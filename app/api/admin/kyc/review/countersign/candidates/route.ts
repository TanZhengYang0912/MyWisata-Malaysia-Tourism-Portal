import { requireKycReviewer } from '@/lib/kyc/reviewer-auth';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { createServiceClient } from '@/lib/supabase/service';
import { issueKycServiceOperationTicket } from '@/lib/kyc/service-operation-ticket';

export async function GET(request: Request) {
  const { db, user, response } = await requireKycReviewer();
  if (response) return response;
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const url = new URL(request.url);
  const submissionId = url.searchParams.get('submissionId');
  const expectedVersionRaw = url.searchParams.get('expectedVersion');
  const expectedVersion = expectedVersionRaw === null ? NaN : Number(expectedVersionRaw);
  if (!submissionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)
      || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    return apiFail('VALIDATION_FAILED', 'A valid KYC case and review version are required', 422);
  }

  const { data, error } = await db.rpc('list_kyc_countersign_candidates', {
    p_submission_id: submissionId,
    p_expected_version: expectedVersion,
  });
  if (error) {
    const message = error.message ?? '';
    if (message.includes('kyc_permission_required')) return apiFail('FORBIDDEN', 'KYC review permission required', 403);
    if (message.includes('kyc_not_assigned')) return apiFail('CONFLICT', 'Reload this case before selecting a second reviewer', 409);
    return apiFail('KYC_REVIEWERS_UNAVAILABLE', 'Eligible reviewers could not be loaded', 503);
  }
  const reviewers = Array.isArray(data) ? data.flatMap((row: unknown) => {
    if (!row || typeof row !== 'object') return [];
    const value = row as { user_id?: unknown; display_name?: unknown };
    return typeof value.user_id === 'string' && typeof value.display_name === 'string'
      ? [{ id: value.user_id, name: value.display_name }]
      : [];
  }) : [];
  const { data: claims, error: claimsError } = await db.auth.getClaims();
  const sessionId = claims?.claims?.session_id;
  if (claimsError || typeof sessionId !== 'string') return apiFail('AUTHORIZATION_UNAVAILABLE', 'Unable to verify reviewer session', 503);
  const service = createServiceClient();
  const ticket = await issueKycServiceOperationTicket(db, {
    submissionId,
    action: 'confirmation.lookup',
    expectedVersion,
  });
  if (!ticket) return apiFail('CONFIRMATION_UNAVAILABLE', 'Current evidence confirmation could not be checked', 503);
  const { data: confirmations, error: confirmationsError } = await service.rpc('get_kyc_review_confirmation_ids_v2', {
    p_ticket_id: ticket.ticketId,
    p_submission_id: submissionId,
    p_expected_version: expectedVersion,
    p_evidence_revision: ticket.evidenceRevision,
    p_primary_actor_id: user.id,
    p_primary_session_id: sessionId,
  });
  if (confirmationsError) return apiFail('CONFIRMATION_UNAVAILABLE', 'Current evidence confirmation could not be checked', 503);
  const state = confirmations && typeof confirmations === 'object' ? confirmations as Record<string, unknown> : {};
  return apiOk({ reviewers, primaryConfirmed: typeof state.primaryConfirmationId === 'string', secondReviewComplete: typeof state.secondaryConfirmationId === 'string' });
}

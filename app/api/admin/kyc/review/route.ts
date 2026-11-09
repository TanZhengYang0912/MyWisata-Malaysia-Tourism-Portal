import { requireKycReviewer } from '@/lib/kyc/reviewer-auth';
import { kycReviewSchema, parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { randomUUID } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { issueKycServiceOperationTicket } from '@/lib/kyc/service-operation-ticket';

export async function POST(request: Request) {
  const { db: supabase, user, response } = await requireKycReviewer();
  if (response) return response;
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, kycReviewSchema);
  if (!parsed.ok) return parsed.response;
  const { submissionId, userId, expectedVersion, action, reasonCode, reasonDetail, operationId } = parsed.data;
  const trimmedReasonDetail = reasonDetail?.trim() || null;

  let primaryConfirmationId: string | null = null;
  let secondaryConfirmationId: string | null = null;
  if (action === 'approve') {
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    const sessionId = claims?.claims?.session_id;
    if (claimsError || typeof sessionId !== 'string') return apiFail('AUTHORIZATION_UNAVAILABLE', 'Unable to verify reviewer session', 503);
    const service = createServiceClient();
    const ticket = await issueKycServiceOperationTicket(supabase, {
      submissionId,
      action: 'confirmation.lookup',
      expectedVersion,
    });
    if (!ticket) return apiFail('CONFIRMATION_UNAVAILABLE', 'Current evidence confirmation could not be checked', 503);
    const { data: confirmations, error: confirmationError } = await service.rpc('get_kyc_review_confirmation_ids_v2', {
      p_ticket_id: ticket.ticketId,
      p_submission_id: submissionId,
      p_expected_version: expectedVersion,
      p_evidence_revision: ticket.evidenceRevision,
      p_primary_actor_id: user.id,
      p_primary_session_id: sessionId,
    });
    if (confirmationError || !confirmations || typeof confirmations !== 'object') return apiFail('CONFIRMATION_UNAVAILABLE', 'Current evidence confirmation could not be checked', 503);
    primaryConfirmationId = typeof confirmations.primaryConfirmationId === 'string' ? confirmations.primaryConfirmationId : null;
    secondaryConfirmationId = typeof confirmations.secondaryConfirmationId === 'string' ? confirmations.secondaryConfirmationId : null;
    if (!primaryConfirmationId) return apiFail('EVIDENCE_CONFIRMATION_REQUIRED', 'Confirm the current identity evidence before approving', 422);
    if (!secondaryConfirmationId) return apiFail('SECOND_REVIEW_REQUIRED', 'An independent reviewer must confirm the same identity evidence before approval', 422);
  }

  const { error: rpcErr } = await supabase.rpc('review_kyc_case_v2', {
    p_submission_id: submissionId,
    p_user_id: userId,
    p_expected_version: expectedVersion,
    p_action: action,
    p_reason_code: action === 'approve' ? null : reasonCode ?? null,
    p_reason_detail: action === 'approve' ? null : trimmedReasonDetail,
    p_operation_id: operationId ?? randomUUID(),
    p_primary_confirmation_id: primaryConfirmationId,
    p_secondary_confirmation_id: secondaryConfirmationId,
  });

  if (rpcErr) {
    const message = rpcErr.message ?? '';
    if (message.includes('admin_required') || message.includes('kyc_permission_required'))
      return apiFail('FORBIDDEN', 'KYC review permission required', 403);
    if (message.includes('self_dealing'))
      return apiFail('SELF_DEALING', 'You cannot review your own KYC submission', 403);
    if (message.includes('kyc_not_active_or_not_found'))
      return apiFail('CONFLICT', 'No active KYC submission found for this user', 409);
    if (message.includes('kyc_assignment_changed'))
      return apiFail('CONFLICT', 'Assignment changed; reload this case before deciding', 409);
    if (message.includes('kyc_not_assigned'))
      return apiFail('CONFLICT', 'This KYC submission is assigned to another reviewer', 409);
    if (message.includes('kyc_identity_conflict'))
      return apiFail('IDENTITY_CONFLICT', 'This identity is already bound to another verified account', 409);
    if (message.includes('kyc_identity_gate_closed'))
      return apiFail('KYC_IDENTITY_ROLLOUT_PENDING', 'KYC identity matching is not enabled yet', 503);
    if (message.includes('kyc_confirmation_invalid') || message.includes('kyc_second_confirmation_invalid')
        || message.includes('kyc_case_changed') || message.includes('kyc_evidence_changed'))
      return apiFail('CONFLICT', 'Evidence or review changed; reload this case and confirm again', 409);
    if (message.includes('kyc_second_confirmation_required') || message.includes('kyc_confirmation_required'))
      return apiFail('VALIDATION_FAILED', 'Current evidence confirmation is required', 422);
    if (message.includes('invalid_action') || message.includes('reason_not_allowed')
        || message.includes('invalid_reason_code') || message.includes('reason_code_not_allowed')
        || message.includes('reason_detail_not_allowed') || message.includes('reason_detail_too_short')) {
      return apiFail('VALIDATION_FAILED', 'KYC review request failed validation', 422);
    }
    return apiFail('RPC_ERROR', 'KYC review could not be completed', 500);
  }

  const kycStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending';

  return apiOk({ userId, kycStatus, action });
}

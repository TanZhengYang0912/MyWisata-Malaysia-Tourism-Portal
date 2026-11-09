import { z } from 'zod';

import { requireKycReviewer } from '@/lib/kyc/reviewer-auth';
import { hashICWithHmac } from '@/lib/kyc/hash';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { issueKycServiceOperationTicket } from '@/lib/kyc/service-operation-ticket';

type Props = { params: Promise<{ resolutionId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const schema = z.object({
  version: z.number().int().positive(),
  documentAccessRefs: z.array(z.string().uuid()).length(2),
  actualDocumentType: z.enum(['national_id', 'driving_license']),
  issuerCountry: z.string().regex(/^[A-Za-z]{2}$/),
  identifierKind: z.literal('my_ic'),
  holderName: z.string().trim().min(2).max(100),
  documentNumber: z.string().trim().min(6).max(32),
  reasonDetail: z.string().trim().min(10).max(500),
}).strict();

export async function POST(request: Request, { params }: Props) {
  const { db, user, response } = await requireKycReviewer();
  if (response) return response;
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { resolutionId } = await params;
  if (!UUID.test(resolutionId)) return apiFail('NOT_FOUND', 'Identity resolution not found', 404);
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const normalizedNumber = parsed.data.documentNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normalizedReason = parsed.data.reasonDetail.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalizedNumber.length >= 6 && normalizedReason.includes(normalizedNumber)
      || /https?:\/\/|(?:^|\s)[/\\][^\s]+|\beyJ[A-Za-z0-9_-]{16,}/i.test(parsed.data.reasonDetail)) {
    return apiFail('VALIDATION_FAILED', 'Do not include identity numbers, links, credentials, or storage details in the review note', 422);
  }
  const { data: state, error: stateError } = await db.rpc('get_kyc_identity_resolution', { p_resolution_id: resolutionId });
  if (stateError || !state || typeof state !== 'object') return apiFail('IDENTITY_RESOLUTION_UNAVAILABLE', 'Resolution state could not be checked', 503);
  const snapshot = state as Record<string, unknown>;
  const role = snapshot.primary === true ? 'primary' : snapshot.secondary === true ? 'independent_second' : null;
  if (!role || snapshot.status !== 'second_review' || snapshot.version !== parsed.data.version || typeof snapshot.caseId !== 'string') {
    return apiFail('CONFLICT', 'Reload the current identity resolution before confirming', 409);
  }
  const ttl = Number(process.env.KYC_REVIEW_CONFIRMATION_TTL_SECONDS);
  if (!Number.isInteger(ttl) || ttl <= 0) return apiFail('KYC_UNAVAILABLE', 'KYC review is temporarily unavailable', 503);
  const { data: claims, error: claimsError } = await db.auth.getClaims();
  const sessionId = claims?.claims?.session_id;
  if (claimsError || typeof sessionId !== 'string' || !z.string().uuid().safeParse(sessionId).success) {
    return apiFail('AUTHORIZATION_UNAVAILABLE', 'Unable to verify reviewer session', 503);
  }
  const service = createServiceClient();
  const { data: submission, error: submissionError } = await service
    .from('kyc_submissions').select('document_type,review_version').eq('id', snapshot.caseId).maybeSingle();
  if (submissionError || !submission) return apiFail('KYC_CASE_UNAVAILABLE', 'KYC case is temporarily unavailable', 503);
  if (submission.review_version === null || submission.review_version === undefined) return apiFail('CONFLICT', 'Reload this case before confirming', 409);
  const ticket = await issueKycServiceOperationTicket(db, {
    submissionId: snapshot.caseId,
    action: 'resolution.confirmation.stage',
    expectedVersion: parsed.data.version,
    targetId: resolutionId,
    purpose: role,
  });
  if (!ticket) return apiFail('AUTHORIZATION_UNAVAILABLE', 'Unable to authorize identity confirmation', 503);
  if (parsed.data.actualDocumentType !== submission.document_type || parsed.data.issuerCountry.toUpperCase() !== 'MY') {
    return apiFail('VALIDATION_FAILED', 'The actual document type and issuing country do not match this KYC case', 422);
  }
  let fingerprint: Awaited<ReturnType<typeof hashICWithHmac>>;
  try { fingerprint = await hashICWithHmac(parsed.data.documentNumber); }
  catch { return apiFail('SERVER_CONFIGURATION', 'KYC review is temporarily unavailable', 503); }
  const { data: confirmationId, error: stageError } = await service.rpc('stage_kyc_resolution_confirmation_with_ticket', {
    p_ticket_id: ticket.ticketId,
    p_expected_actor_id: user.id,
    p_expected_session_id: sessionId,
    p_resolution_id: resolutionId,
    p_expected_version: parsed.data.version,
    p_actor_role: role,
    p_document_access_refs: parsed.data.documentAccessRefs,
    p_actual_document_type: parsed.data.actualDocumentType,
    p_issuer_country: parsed.data.issuerCountry.toUpperCase(),
    p_identifier_kind: parsed.data.identifierKind,
    p_holder_name: parsed.data.holderName,
    p_number_hmac: fingerprint.value,
    p_reason_detail: parsed.data.reasonDetail,
    p_ttl_seconds: ttl,
  });
  if (stageError || typeof confirmationId !== 'string') {
    const message = stageError?.message ?? '';
    if (message.includes('permission_required')) return apiFail('FORBIDDEN', 'Identity resolution permission required', 403);
    if (message.includes('document_review_evidence_required')) return apiFail('EVIDENCE_VIEW_REQUIRED', 'Open the current front and back documents before confirming', 422);
    return apiFail('CONFLICT', 'The case or evidence changed; reload both documents and try again', 409);
  }
  const { error: attestError } = await db.rpc('attest_kyc_resolution_confirmation', { p_confirmation_id: confirmationId });
  if (attestError) return apiFail('CONFIRMATION_FAILED', 'Evidence confirmation could not be verified; reload and try again', 409);
  return apiOk({ confirmed: true });
}

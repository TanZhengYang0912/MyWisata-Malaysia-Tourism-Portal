import { z } from 'zod';
import { requireKycReviewer } from '@/lib/kyc/reviewer-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { hashICWithHmac } from '@/lib/kyc/hash';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { issueKycServiceOperationTicket } from '@/lib/kyc/service-operation-ticket';

const uuid = z.string().uuid();
const schema = z.object({
  submissionId: uuid,
  expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  purpose: z.enum(['primary', 'independent_second']).default('primary'),
  documentAccessRefs: z.array(uuid).min(1).max(2),
  actualDocumentType: z.enum(['national_id', 'passport', 'driving_license']),
  issuerCountry: z.string().regex(/^[A-Za-z]{2}$/),
  identifierKind: z.enum(['my_ic', 'passport']),
  holderName: z.string().trim().min(2).max(100),
  documentNumber: z.string().trim().min(6).max(32),
  reasonCode: z.enum(['ocr_number_mismatch', 'ocr_name_mismatch', 'ocr_unavailable', 'ocr_unreadable']),
  reasonDetail: z.string().trim().max(500).optional(),
}).strict();

export async function POST(request: Request) {
  const { db, user, response } = await requireKycReviewer();
  if (response) return response;
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const value = parsed.data;
  const ttl = Number(process.env.KYC_REVIEW_CONFIRMATION_TTL_SECONDS);
  if (!Number.isInteger(ttl) || ttl <= 0) return apiFail('KYC_UNAVAILABLE', 'KYC review is temporarily unavailable', 503);

  const { data: claims, error: claimsError } = await db.auth.getClaims();
  const sessionId = claims?.claims?.session_id;
  if (claimsError || typeof sessionId !== 'string' || !z.string().uuid().safeParse(sessionId).success) {
    return apiFail('AUTHORIZATION_UNAVAILABLE', 'Unable to verify reviewer session', 503);
  }

  const ticket = await issueKycServiceOperationTicket(db, {
    submissionId: value.submissionId,
    action: 'confirmation.stage',
    expectedVersion: value.expectedVersion,
    purpose: value.purpose,
  });
  if (!ticket) return apiFail('AUTHORIZATION_UNAVAILABLE', 'Unable to authorize evidence confirmation', 503);

  const service = createServiceClient();
  const { data: submission, error: submissionError } = await service
    .from('kyc_submissions').select('user_id,document_type,review_version').eq('id', value.submissionId).maybeSingle();
  if (submissionError || !submission) {
    return apiFail('KYC_CASE_UNAVAILABLE', 'KYC case is temporarily unavailable', 503);
  }
  if (submission.review_version !== value.expectedVersion) return apiFail('CONFLICT', 'Reload this case before confirming evidence', 409);
  if (value.actualDocumentType !== submission.document_type
      || (value.identifierKind === 'my_ic' && !['national_id', 'driving_license'].includes(value.actualDocumentType))
      || (value.identifierKind === 'passport' && value.actualDocumentType !== 'passport')
      || (value.identifierKind === 'my_ic' && value.issuerCountry.toUpperCase() !== 'MY')) {
    return apiFail('VALIDATION_FAILED', 'Document type and issuing country do not match this KYC application', 422);
  }
  const requiredAccessCount = submission.document_type === 'passport' ? 1 : 2;
  if (value.documentAccessRefs.length !== requiredAccessCount || new Set(value.documentAccessRefs).size !== requiredAccessCount) {
    return apiFail('EVIDENCE_VIEW_REQUIRED', 'Open all required document pages before confirming', 422);
  }

  let fingerprint: Awaited<ReturnType<typeof hashICWithHmac>>;
  try { fingerprint = await hashICWithHmac(value.documentNumber); }
  catch { return apiFail('SERVER_CONFIGURATION', 'KYC review is temporarily unavailable', 503); }

  const { data: confirmationId, error: stageError } = await service.rpc('stage_kyc_identity_confirmation_with_ticket', {
    p_ticket_id: ticket.ticketId,
    p_expected_actor_id: user.id,
    p_expected_session_id: sessionId,
    p_submission_id: value.submissionId,
    p_review_version: value.expectedVersion,
    p_evidence_revision: ticket.evidenceRevision,
    p_actual_document_type: value.actualDocumentType,
    p_issuer_country: value.issuerCountry.toUpperCase(),
    p_identifier_kind: value.identifierKind,
    p_confirmed_holder_name: value.holderName,
    p_confirmed_number_hmac: fingerprint.value,
    p_source: 'manual',
    p_observation_id: null,
    p_document_access_refs: value.documentAccessRefs,
    p_reason_code: value.reasonCode,
    p_reason_detail: value.reasonDetail?.trim() || null,
    p_risk_level: 'high',
    p_purpose: value.purpose,
    p_ttl_seconds: ttl,
  });
  if (stageError || typeof confirmationId !== 'string') {
    const message = stageError?.message ?? '';
    if (message.includes('kyc_case_changed') || message.includes('kyc_evidence_changed')) return apiFail('CONFLICT', 'The evidence changed; reopen both documents and confirm again', 409);
    if (message.includes('kyc_document_review_evidence_required')) return apiFail('EVIDENCE_VIEW_REQUIRED', 'Open all required document pages before confirming', 422);
    if (message.includes('kyc_not_assigned')) return apiFail('CONFLICT', 'This case is assigned to another reviewer', 409);
    return apiFail('CONFIRMATION_FAILED', 'Evidence confirmation could not be recorded', 500);
  }

  const { error: attestError } = await db.rpc('attest_kyc_identity_confirmation', { p_confirmation_id: confirmationId });
  if (attestError) return apiFail('CONFIRMATION_FAILED', 'Evidence confirmation could not be verified; reload the case and try again', 409);
  return apiOk({ confirmed: true });
}

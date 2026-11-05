import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { hashICWithHmac } from '@/lib/kyc/hash';
import { abandonAndRemoveKycEvidence, buildKycEvidencePaths, validateKycUploadFile } from '@/lib/kyc/submission';
import { prepareKycEvidenceImage } from '@/lib/kyc/evidence-image';
import { readBoundedFormData, RequestBodyError } from '@/lib/validation/request-body';
import { withPortalWorkload, WorkloadUnavailableError } from '@/lib/operations/workload';
import { reserveGuestRateLimit } from '@/lib/checkout/guest-session';
import { createHash } from 'node:crypto';
import { normalizeIC } from '@/lib/kyc/hash';

const IC_PATTERNS: Record<string, RegExp> = {
  national_id: /^\d{6}-?\d{2}-?\d{4}$/,
  driving_license: /^\d{6}-?\d{2}-?\d{4}$/,
  passport: /^[A-Za-z]{1,2}[0-9]{6,8}$/,
};

function safeSubmissionFailure(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  if (message.includes('active_submission_exists')) {
    return apiFail('ACTIVE_SUBMISSION_EXISTS', 'You already have an active KYC submission', 409);
  }
  if (
    message.includes('invalid_ic_fingerprint')
    || message.includes('invalid_document_type')
    || message.includes('ocr_consent_required')
  ) {
    return apiFail('INVALID_EVIDENCE', 'KYC evidence is invalid', 422);
  }
  if (
    message.includes('invalid_document_path')
    || message.includes('documents_missing')
    || message.includes('invalid_document_mime')
  ) {
    return apiFail('INVALID_DOCUMENT_EVIDENCE', 'KYC document evidence is invalid', 422);
  }
  return apiFail('SUBMIT_FAILED', 'Unable to submit KYC documents', 500);
}

async function prepareUpload(request: Request, signal: AbortSignal, ownerId: string, service: ReturnType<typeof createServiceClient>) {
  let formData: FormData;
  try { formData = await readBoundedFormData(request, 10 * 1024 * 1024 + 64 * 1024, signal); }
  catch (error) {
    return apiFail('INVALID_FORM', 'Could not parse form data within upload limits', error instanceof RequestBodyError && error.code === 'too_large' ? 413 : error instanceof RequestBodyError && error.code === 'timeout' ? 408 : 400);
  }

  if (formData.get('ocrConsent') !== 'true') {
    return apiFail('OCR_CONSENT_REQUIRED', 'Consent is required for private document processing', 422);
  }

  const icNumber = formData.get('icNumber');
  const holderName = formData.get('holderName');
  const docType = formData.get('docType');
  const operationId = formData.get('operationId');
  const draftId = formData.get('draftId');
  const draftVersion = formData.get('draftVersion');
  const frontFile = formData.get('frontFile');
  const backFile = formData.get('backFile');
  if (typeof icNumber !== 'string' || typeof holderName !== 'string' || holderName.trim().length < 2 || holderName.trim().length > 100
    || typeof docType !== 'string' || typeof operationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(operationId)
    || draftId !== null && (typeof draftId !== 'string' || !/^[0-9a-f-]{36}$/i.test(draftId))
    || (draftId === null && (!(frontFile instanceof File) || !(backFile instanceof File)))
    || (draftId !== null && (typeof draftVersion !== 'string' || !/^\d+$/.test(draftVersion)))) {
    return apiFail('MISSING_FIELDS', 'holderName, icNumber, docType, operationId, and current KYC evidence are required', 422);
  }
  if (!(docType in IC_PATTERNS)) {
    return apiFail('INVALID_DOC_TYPE', 'docType must be national_id, passport, or driving_license', 422);
  }
  if (!IC_PATTERNS[docType].test(icNumber.trim().toUpperCase())) {
    return apiFail('INVALID_IC', 'IC number format does not match document type', 422);
  }

  let frontMimeType: string; let backMimeType: string; let images: Buffer[];
  if (typeof draftId === 'string') {
    const { data, error } = await service.rpc('get_kyc_draft', { p_owner_user_id: ownerId });
    const draft = Array.isArray(data) ? data[0] : data;
    if (error || !draft || draft.id !== draftId || Number(draft.version) !== Number(draftVersion)
      || draft.document_type !== docType || draft.holder_name !== holderName.trim()) {
      return apiFail('DRAFT_CONFLICT', 'Saved KYC draft changed; reload it before submitting', 409);
    }
    const [frontPath, backPath] = await Promise.all((['front', 'back'] as const).map(async (side) => {
      const { data: path, error: pathError } = await service.rpc('get_kyc_draft_document', {
        p_owner_user_id: ownerId, p_draft_id: draftId, p_side: side,
      });
      if (pathError || typeof path !== 'string') throw new Error('draft_document_unavailable');
      return path;
    }));
    const bucket = service.storage.from('kyc-documents');
    const [front, back] = await Promise.all([bucket.download(frontPath), bucket.download(backPath)]);
    if (front.error || !front.data || back.error || !back.data) return apiFail('DRAFT_EVIDENCE_UNAVAILABLE', 'Saved KYC evidence is unavailable', 503);
    frontMimeType = front.data.type; backMimeType = back.data.type;
    images = [Buffer.from(await front.data.arrayBuffer()), Buffer.from(await back.data.arrayBuffer())];
  } else {
    const frontUpload = frontFile as File; const backUpload = backFile as File;
    const [front, back] = await Promise.all([validateKycUploadFile(frontUpload), validateKycUploadFile(backUpload)]);
    if (!front.ok) return apiFail(front.code, 'Front document must be a valid JPEG, PNG, or WebP photo under 5 MB', 422);
    if (!back.ok) return apiFail(back.code, 'Back document must be a valid JPEG, PNG, or WebP photo under 5 MB', 422);
    let preparedImages: Awaited<ReturnType<typeof prepareKycEvidenceImage>>[];
    try {
      preparedImages = [];
      signal.throwIfAborted();
      preparedImages.push(await prepareKycEvidenceImage(Buffer.from(front.buffer), frontUpload.type));
      signal.throwIfAborted();
      preparedImages.push(await prepareKycEvidenceImage(Buffer.from(back.buffer), backUpload.type));
      signal.throwIfAborted();
    } catch { return apiFail('INVALID_FILE_CONTENT', 'Documents must be decodable photos under the image limits', 422); }
    frontMimeType = frontUpload.type; backMimeType = backUpload.type;
    images = preparedImages.map((image) => image.stored);
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(frontMimeType) || !['image/jpeg', 'image/png', 'image/webp'].includes(backMimeType)) {
    return apiFail('INVALID_DOCUMENT_EVIDENCE', 'KYC document evidence is invalid', 422);
  }
  return { icNumber, holderName: holderName.trim(), docType, operationId, draftId: typeof draftId === 'string' ? draftId : null,
    frontMimeType, backMimeType, images };
}

export async function POST(request: Request) {
  const authenticated = await createClient();
  const { data: { user } } = await authenticated.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // Read-only fast path. begin also supersedes old info_requested cases, so it
  // must remain after image validation. Its atomic check still fences races.
  const service = createServiceClient();
  const idempotencyKey = request.headers.get('Idempotency-Key');
  if (idempotencyKey && /^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    const { data: previousOperation } = await authenticated.rpc('get_my_kyc_operation', { p_operation_id: idempotencyKey });
    if (previousOperation && typeof previousOperation === 'object' && 'state' in previousOperation
      && previousOperation.state === 'succeeded' && 'submissionId' in previousOperation && typeof previousOperation.submissionId === 'string') {
      return apiOk({ submissionId: previousOperation.submissionId, status: 'pending', operationId: idempotencyKey, manualReviewRequired: true });
    }
  }
  const { data: activeCases, error: availabilityError } = await service.from('kyc_submissions')
    .select('id').eq('user_id', user.id).in('status', ['draft', 'pending']).limit(1);
  if (availabilityError || !Array.isArray(activeCases)) return apiFail('KYC_UNAVAILABLE', 'KYC submission is temporarily unavailable', 503);
  if (activeCases.length) return apiFail('ACTIVE_SUBMISSION_EXISTS', 'You already have an active KYC submission', 409);


  if (!await reserveGuestRateLimit(`kyc-upload:${user.id}`, 3, 600)) {
    return apiFail('RATE_LIMITED', 'Too many upload attempts; please try again later', 429);
  }
  let prepared: Awaited<ReturnType<typeof prepareUpload>>;
  try { prepared = await withPortalWorkload('kyc_upload', (signal) => prepareUpload(request, signal, user.id, service), request.signal); }
  catch (error) {
    const response = apiFail('KYC_BUSY', 'Document processing is busy; please keep your files and try again shortly', error instanceof WorkloadUnavailableError && error.code === 'busy' ? 429 : 503);
    response.headers.set('Retry-After', '10');
    return response;
  }
  if (prepared instanceof Response) return prepared;
  const { icNumber, holderName, docType, operationId, draftId, frontMimeType, backMimeType, images } = prepared;
  if (idempotencyKey && idempotencyKey !== operationId) return apiFail('IDEMPOTENCY_KEY_MISMATCH', 'Submission operation could not be matched', 409);

  let fingerprint: { algorithm: 'hmac_sha256_v1'; value: string };
  try { fingerprint = await hashICWithHmac(icNumber.trim()); }
  catch { return apiFail('SERVER_CONFIGURATION', 'KYC submission is temporarily unavailable', 503); }

  const evidenceRevision = createHash('sha256').update(images[0]).update(images[1]).digest('hex');
  const { data: operation, error: beginError } = await service.rpc('begin_kyc_submission_v2', {
    p_operation_id: operationId,
    p_user_id: user.id,
    p_ic_hash: fingerprint.value,
    p_doc_type: docType,
    p_holder_name: holderName,
    p_evidence_fingerprint: evidenceRevision,
    p_ocr_consent: true,
  });
  const operationResult = operation as { submissionId?: unknown; state?: unknown } | null;
  const submissionId = typeof operationResult?.submissionId === 'string' ? operationResult.submissionId : null;
  if (beginError || typeof submissionId !== 'string') return safeSubmissionFailure(beginError);
  if (operationResult?.state === 'succeeded') return apiOk({ submissionId, status: 'pending', operationId, manualReviewRequired: true });

  const { error: confirmationError } = await service.rpc('record_kyc_user_confirmation', {
    p_submission_id: submissionId,
    p_owner_user_id: user.id,
    p_holder_name: holderName,
    p_document_type: docType,
    p_document_number_hmac: fingerprint.value,
    p_hash_version: fingerprint.algorithm,
    p_document_number_last4: normalizeIC(icNumber).slice(-4),
    p_evidence_revision: evidenceRevision,
  });
  if (confirmationError) {
    const { data: abandoned } = await authenticated.rpc('abandon_kyc_submission', { p_submission_id: submissionId });
    if (abandoned !== true) return apiFail('CLEANUP_FAILED', 'KYC submission state could not be safely resolved', 500);
    return apiFail('CONFIRMATION_FAILED', 'Confirmed identity details could not be saved', 503);
  }

  const paths = buildKycEvidencePaths(user.id, submissionId, operationId, frontMimeType, backMimeType);
  const cleanup = async () => {
    // `abandon_kyc_submission` is the state reconciliation step: it returns
    // true only when this caller's draft was deleted. Never remove evidence
    // after a finalize timeout/error unless that proof is positive.
    const result = await abandonAndRemoveKycEvidence({ submissionId, paths, authenticated, service }).catch(() => ({ ok: false as const, reason: 'draft_not_abandoned' }));
    if (!result.ok) {
      console.error('KYC draft cleanup failed', { submissionId, reason: result.reason });
      return false;
    }
    return true;
  };

  try {
    const frontUpload = await service.storage.from('kyc-documents').upload(paths.front, images[0], {
      contentType: frontMimeType, upsert: true,
    });
    if (frontUpload.error) {
      if (!await cleanup()) return apiFail('CLEANUP_FAILED', 'KYC submission state could not be safely resolved', 500);
      return apiFail('UPLOAD_FAILED', 'Unable to upload KYC documents', 502);
    }

    const backUpload = await service.storage.from('kyc-documents').upload(paths.back, images[1], {
      contentType: backMimeType, upsert: true,
    });
    if (backUpload.error) {
      if (!await cleanup()) return apiFail('CLEANUP_FAILED', 'KYC submission state could not be safely resolved', 500);
      return apiFail('UPLOAD_FAILED', 'Unable to upload KYC documents', 502);
    }

    // Finalization atomically enqueues private pre-screening in the database.
    // Only watermarked evidence persists; OCR never delays the upload request.
    const { error: finalizeError } = await authenticated.rpc('finalize_kyc_submission', {
      p_submission_id: submissionId,
      p_front_path: paths.front,
      p_back_path: paths.back,
    });
    if (finalizeError) {
      if (!await cleanup()) return apiFail('CLEANUP_FAILED', 'KYC submission state could not be safely resolved', 500);
      return safeSubmissionFailure(finalizeError);
    }

    await service.rpc('complete_kyc_submit_operation', { p_operation_id: operationId, p_submission_id: submissionId, p_owner_user_id: user.id });
    if (draftId) {
      await service.rpc('link_kyc_ocr_observation', { p_owner_user_id: user.id, p_draft_id: draftId, p_submission_id: submissionId, p_evidence_revision: evidenceRevision });
      await service.rpc('mark_kyc_draft_submitted', { p_owner_user_id: user.id, p_draft_id: draftId, p_submission_id: submissionId });
    }

    return apiOk({
      submissionId,
      status: 'pending',
      ocrStatus: 'queued',
      operationId,
      manualReviewRequired: true,
    }, { status: 201 });
  } catch {
    if (!await cleanup()) return apiFail('CLEANUP_FAILED', 'KYC submission state could not be safely resolved', 500);
    return apiFail('UPLOAD_FAILED', 'Unable to submit KYC documents', 502);
  }
}

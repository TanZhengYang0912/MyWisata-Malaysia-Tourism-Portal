import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { readBoundedFormData, RequestBodyError } from '@/lib/validation/request-body';
import { hasDuplicateKycDocumentSides, validateKycUploadFile } from '@/lib/kyc/submission';
import { prepareKycEvidenceImage } from '@/lib/kyc/evidence-image';
import { extractKycPreviewFields } from '@/lib/kyc/ocr';
import { hashICWithHmac, normalizeIC } from '@/lib/kyc/hash';
import { withPortalWorkload, WorkloadUnavailableError } from '@/lib/operations/workload';
import { guestAddressRateKey, reserveGuestRateLimit } from '@/lib/checkout/guest-session';
import { getRequiredKycDocumentSides, type KycDocumentType } from '@/lib/kyc/document-policy';
import { buildKycOcrSourceRevision } from '@/lib/kyc/ocr-observation';

const positiveInteger = (name: string) => {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};
const noStore = (response: Response) => { response.headers.set('Cache-Control', 'private, no-store, max-age=0'); response.headers.set('Referrer-Policy', 'no-referrer'); return response; };

export async function POST(request: Request) {
  const authenticated = await createClient();
  const { data: { user } } = await authenticated.auth.getUser();
  if (!user) return noStore(apiFail('UNAUTHORIZED', 'Sign in required', 401));
  if (process.env.KYC_CLEAN_OCR_ENABLED !== 'true' || process.env.KYC_OCR_PREVIEW_ENABLED !== 'true') return noStore(apiFail('PREVIEW_DISABLED', 'Document preview is not available yet', 503));
  const userLimit = positiveInteger('KYC_OCR_PREVIEW_USER_LIMIT');
  const ipLimit = positiveInteger('KYC_OCR_PREVIEW_IP_LIMIT');
  const windowSeconds = positiveInteger('KYC_OCR_PREVIEW_RATE_WINDOW_SECONDS');
  if (!userLimit || !ipLimit || !windowSeconds) return noStore(apiFail('PREVIEW_DISABLED', 'Document preview is not configured', 503));
  if (!await reserveGuestRateLimit(`kyc-preview-user:${user.id}`, userLimit, windowSeconds)
    || !await reserveGuestRateLimit(`kyc-preview-ip:${guestAddressRateKey(request)}`, ipLimit, windowSeconds)) {
    const response = noStore(apiFail('RATE_LIMITED', 'Too many document previews; please try later', 429));
    response.headers.set('Retry-After', String(windowSeconds));
    return response;
  }
  let form: FormData;
  try { form = await readBoundedFormData(request, 10 * 1024 * 1024 + 96 * 1024, request.signal); }
  catch (error) { return noStore(apiFail('INVALID_FORM', 'Could not read document preview', error instanceof RequestBodyError && error.code === 'too_large' ? 413 : 400)); }
  const draftId = form.get('draftId');
  const version = form.get('version');
  if (typeof draftId !== 'string' || !/^[0-9a-f-]{36}$/i.test(draftId) || typeof version !== 'string' || !/^\d+$/.test(version)) {
    return noStore(apiFail('INVALID_REQUEST', 'Saved draft and version are required', 422));
  }
  const service = createServiceClient();
  const { data, error } = await service.rpc('get_kyc_draft', { p_owner_user_id: user.id });
  const draft = Array.isArray(data) ? data[0] : data;
  if (error || !draft || draft.id !== draftId || Number(draft.version) !== Number(version)) {
    return noStore(apiFail('DRAFT_CONFLICT', 'Saved draft changed; reload it before reading the document', 409));
  }
  if (draft.document_type === 'passport' && process.env.KYC_CHINESE_PASSPORT_OCR_ENABLED !== 'true') {
    return noStore(apiFail('PREVIEW_DISABLED', 'Passport preview is not enabled yet', 503));
  }

  try {
    const sides = getRequiredKycDocumentSides(draft.document_type as KycDocumentType);
    const { cleanImages, result } = await withPortalWorkload('kyc_preview', async (signal) => {
      const preparedImages = await Promise.all(sides.map(async (side) => {
        const entry = form.get(`${side}File`);
        if (!(entry instanceof File)) throw new Error('clean_source_required');
        const checked = await validateKycUploadFile(entry);
        if (!checked.ok) throw new Error('invalid_clean_source');
        const inputSha256 = createHash('sha256').update(Buffer.from(checked.buffer)).digest('hex');
        if (draft[`${side}_input_sha256`] !== inputSha256) throw new Error('clean_source_changed');
        const prepared = await prepareKycEvidenceImage(Buffer.from(checked.buffer), entry.type);
        return { side, mimeType: entry.type, bytes: new Uint8Array(prepared.ocr), inputSha256, cleanSha256: createHash('sha256').update(prepared.ocr).digest('hex') };
      }));
      if (draft.document_type === 'national_id' && hasDuplicateKycDocumentSides(preparedImages[0]?.inputSha256 ?? null, preparedImages[1]?.inputSha256 ?? null)) throw new Error('duplicate_document_sides');
      signal.throwIfAborted();
      const preview = await extractKycPreviewFields({ documentType: draft.document_type,
        front: { mimeType: preparedImages[0].mimeType, bytes: preparedImages[0].bytes },
        ...(preparedImages[1] ? { back: { mimeType: preparedImages[1].mimeType, bytes: preparedImages[1].bytes } } : {}) });
      return { cleanImages: preparedImages, result: preview };
    }, request.signal);
    const sourceRevision = buildKycOcrSourceRevision({ documentType: draft.document_type, cleanTransformVersion: 'clean-v1',
      frontInputSha256: cleanImages[0].inputSha256, frontCleanSha256: cleanImages[0].cleanSha256,
      backInputSha256: cleanImages[1]?.inputSha256 ?? null, backCleanSha256: cleanImages[1]?.cleanSha256 ?? null });
    let documentNumberHmac: string | null = null;
    let documentNumberLast4: string | null = null;
    if (result.documentNumber) {
      const fingerprint = await hashICWithHmac(result.documentNumber);
      documentNumberHmac = fingerprint.value;
      documentNumberLast4 = normalizeIC(result.documentNumber).slice(-4) || null;
    }
    const { error: observationError } = await service.rpc('record_kyc_draft_ocr_observation_v2', {
      p_owner_user_id: user.id, p_draft_id: draft.id, p_artifact_revision: draft.evidence_revision,
      p_front_input_sha256: cleanImages[0].inputSha256, p_front_clean_sha256: cleanImages[0].cleanSha256,
      p_back_input_sha256: cleanImages[1]?.inputSha256 ?? null, p_back_clean_sha256: cleanImages[1]?.cleanSha256 ?? null,
      p_clean_transform_version: 'clean-v1', p_parser_version: 'kyc-parser-v1', p_policy_version: 'kyc-policy-v1',
      p_source_revision: sourceRevision, p_engine: result.providerModel, p_holder_name: result.holderName,
      p_document_number_hmac: documentNumberHmac, p_document_number_last4: documentNumberLast4,
      p_status: result.status, p_confidence: result.confidence, p_issuer_country: result.issuerCountry ?? null,
      p_nationality: result.nationality ?? null, p_mrz_status: result.mrzStatus ?? null,
      p_visual_comparison_status: result.visualComparisonStatus ?? null, p_expiry_date: result.expiryDate ?? null,
      p_failure_code: result.failureCode ?? (result.visualComparisonStatus ? `passport_visual_${result.visualComparisonStatus}` : null),
    });
    if (observationError) return noStore(apiFail('PREVIEW_UNAVAILABLE', 'Document preview could not be saved; enter the details manually', 503));
    return noStore(apiOk({ preview: { status: result.status, holderName: result.holderName, documentNumber: result.documentNumber,
      expiryDate: result.expiryDate, mrzStatus: result.mrzStatus, visualComparisonStatus: result.visualComparisonStatus } }));
  } catch (error) {
    if (error instanceof Error && error.message === 'duplicate_document_sides') return noStore(apiFail('DUPLICATE_DOCUMENT_SIDES', 'The same photo cannot be used for both sides of a MyKad', 422));
    if (error instanceof Error && error.message === 'clean_source_required') return noStore(apiFail('SOURCE_REQUIRED', 'Re-select the original document photo before running OCR', 409));
    if (error instanceof Error && error.message === 'clean_source_changed') return noStore(apiFail('SOURCE_CHANGED', 'The original document changed; save it again before running OCR', 409));
    if (error instanceof Error && error.message === 'invalid_clean_source') return noStore(apiFail('INVALID_EVIDENCE', 'The selected document photo is invalid', 422));
    if (error instanceof WorkloadUnavailableError) {
      const status = error.code === 'busy' ? 429 : 503;
      const response = noStore(apiFail(error.code === 'busy' ? 'PREVIEW_BUSY' : 'PREVIEW_UNAVAILABLE',
        error.code === 'busy' ? 'Document preview is busy; continue with manual entry or try later' : 'Document preview is temporarily unavailable', status));
      if (status === 429) response.headers.set('Retry-After', '10');
      return response;
    }
    return noStore(apiFail('PREVIEW_UNAVAILABLE', 'Document preview is temporarily unavailable', 503));
  }
}

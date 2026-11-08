import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { extractKycPreviewFields } from '@/lib/kyc/ocr';
import { hashICWithHmac, normalizeIC } from '@/lib/kyc/hash';
import { withPortalWorkload, WorkloadUnavailableError } from '@/lib/operations/workload';
import { guestAddressRateKey, reserveGuestRateLimit } from '@/lib/checkout/guest-session';
import { getRequiredKycDocumentSides, type KycDocumentType } from '@/lib/kyc/document-policy';

const schema = z.object({ draftId: z.string().uuid(), version: z.number().int().positive() }).strict();
const positiveInteger = (name: string) => {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};
const noStore = (response: Response) => { response.headers.set('Cache-Control', 'private, no-store, max-age=0'); response.headers.set('Referrer-Policy', 'no-referrer'); return response; };

export async function POST(request: Request) {
  const authenticated = await createClient();
  const { data: { user } } = await authenticated.auth.getUser();
  if (!user) return noStore(apiFail('UNAUTHORIZED', 'Sign in required', 401));
  if (process.env.KYC_OCR_PREVIEW_ENABLED !== 'true') return noStore(apiFail('PREVIEW_DISABLED', 'Document preview is not available yet', 503));
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
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return noStore(parsed.response);
  const service = createServiceClient();
  const { data, error } = await service.rpc('get_kyc_draft', { p_owner_user_id: user.id });
  const draft = Array.isArray(data) ? data[0] : data;
  if (error || !draft || draft.id !== parsed.data.draftId || Number(draft.version) !== parsed.data.version) {
    return noStore(apiFail('DRAFT_CONFLICT', 'Saved draft changed; reload it before reading the document', 409));
  }
  if (draft.document_type === 'passport' && process.env.KYC_CHINESE_PASSPORT_OCR_ENABLED !== 'true') {
    return noStore(apiFail('PREVIEW_DISABLED', 'Passport preview is not enabled yet', 503));
  }

  try {
    const sides = getRequiredKycDocumentSides(draft.document_type as KycDocumentType);
    const paths = await Promise.all(sides.map(async (side) => {
      const { data: path, error: pathError } = await service.rpc('get_kyc_draft_document', {
        p_owner_user_id: user.id, p_draft_id: draft.id, p_side: side,
      });
      if (pathError || typeof path !== 'string') throw new Error('draft_document_unavailable');
      return path;
    }));
    const bucket = service.storage.from('kyc-documents');
    const objects = await Promise.all(paths.map((path) => bucket.download(path)));
    if (objects.some((object) => object.error || !object.data)) throw new Error('draft_document_unavailable');
    const result = await withPortalWorkload('kyc_preview', async (signal) => {
      const front = new Uint8Array(await objects[0].data!.arrayBuffer());
      const back = objects[1]?.data ? new Uint8Array(await objects[1].data.arrayBuffer()) : undefined;
      signal.throwIfAborted();
      return extractKycPreviewFields({ documentType: draft.document_type,
        front: { mimeType: objects[0].data!.type, bytes: front }, ...(back && objects[1]?.data ? { back: { mimeType: objects[1].data.type, bytes: back } } : {}) });
    }, request.signal);
    let documentNumberHmac: string | null = null;
    let documentNumberLast4: string | null = null;
    if (result.documentNumber) {
      const fingerprint = await hashICWithHmac(result.documentNumber);
      documentNumberHmac = fingerprint.value;
      documentNumberLast4 = normalizeIC(result.documentNumber).slice(-4) || null;
    }
    const { error: observationError } = await service.rpc('record_kyc_draft_ocr_observation', {
      p_owner_user_id: user.id, p_draft_id: draft.id, p_evidence_revision: draft.evidence_revision,
      p_engine: result.providerModel, p_holder_name: result.holderName,
      p_document_number_hmac: documentNumberHmac, p_document_number_last4: documentNumberLast4,
      p_status: result.status, p_confidence: result.confidence,
      p_failure_code: result.failureCode ?? (result.visualComparisonStatus ? `passport_visual_${result.visualComparisonStatus}` : null),
    });
    if (observationError) return noStore(apiFail('PREVIEW_UNAVAILABLE', 'Document preview could not be saved; enter the details manually', 503));
    return noStore(apiOk({ preview: { status: result.status, holderName: result.holderName, documentNumber: result.documentNumber,
      expiryDate: result.expiryDate, mrzStatus: result.mrzStatus, visualComparisonStatus: result.visualComparisonStatus } }));
  } catch (error) {
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

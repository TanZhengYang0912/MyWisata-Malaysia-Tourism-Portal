import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const rpc = vi.fn();
const download = vi.fn();
const admit = vi.fn().mockResolvedValue(true);
const extract = vi.fn();
const fingerprint = vi.fn();
const prepare = vi.fn();
const validateFile = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc, storage: { from: () => ({ download }) } }) }));
vi.mock('@/lib/checkout/guest-session', () => ({ guestAddressRateKey: () => 'guest-address:127.0.0.1', reserveGuestRateLimit: admit }));
vi.mock('@/lib/operations/workload', () => ({
  withPortalWorkload: async (_scope: string, work: (signal: AbortSignal) => Promise<unknown>) => work(new AbortController().signal),
  WorkloadUnavailableError: class WorkloadUnavailableError extends Error { constructor(public code: 'busy' | 'unavailable') { super(code); } },
}));
vi.mock('@/lib/kyc/ocr', () => ({ extractKycPreviewFields: extract }));
vi.mock('@/lib/kyc/evidence-image', () => ({ prepareKycEvidenceImage: prepare }));
vi.mock('@/lib/kyc/submission', () => ({ validateKycUploadFile: validateFile }));
vi.mock('@/lib/kyc/hash', () => ({ hashICWithHmac: fingerprint, normalizeIC: (value: string) => value.replace(/[-\s]/g, '').toUpperCase() }));

const { POST } = await import('../route');
const owner = '11111111-1111-4111-8111-111111111111';
const draftId = '22222222-2222-4222-8222-222222222222';
const formRequest = (form: FormData) => new Request('https://example.test/api/kyc/preview', { method: 'POST', body: form });

describe('/api/kyc/preview', () => {
  beforeEach(() => {
    vi.stubEnv('KYC_CLEAN_OCR_ENABLED','true');
    vi.stubEnv('KYC_OCR_PREVIEW_ENABLED', 'true');
    vi.stubEnv('KYC_OCR_PREVIEW_USER_LIMIT', '3');
    vi.stubEnv('KYC_OCR_PREVIEW_IP_LIMIT', '10');
    vi.stubEnv('KYC_OCR_PREVIEW_RATE_WINDOW_SECONDS', '600');
    getUser.mockResolvedValue({ data: { user: { id: owner } } });
    rpc.mockReset()
      .mockResolvedValueOnce({ data: [{ id: draftId, version: 2, document_type: 'national_id', evidence_revision: 'a'.repeat(64), front_input_sha256: createHash('sha256').update('original').digest('hex'), back_input_sha256: createHash('sha256').update('backoriginal').digest('hex') }], error: null })
      .mockResolvedValueOnce({ data: draftId, error: null });
    admit.mockReset().mockResolvedValue(true);
    download.mockReset().mockResolvedValue({ data: new Blob(['private'], { type: 'image/jpeg' }), error: null });
    prepare.mockReset().mockImplementation(async (bytes: Buffer) => ({ ocr: Buffer.from('clean:' + bytes.toString()), stored: Buffer.from('stored') }));
    validateFile.mockReset().mockImplementation(async (file: File) => ({ ok: true, buffer: await file.arrayBuffer() }));
    extract.mockReset().mockResolvedValue({ status: 'extracted', holderName: 'OCR Name', documentNumber: '900101-14-5678', expiryDate: null,
      confidence: 0.9, providerModel: 'internal-model', failureCode: undefined });
    fingerprint.mockResolvedValue({ algorithm: 'hmac_sha256_v1', value: 'a'.repeat(64) });
  });


  it('runs OCR on the newly supplied clean source after matching its hash to the saved draft', async () => {
    const image = new File(['original'], 'front.jpg', { type: 'image/jpeg' });
    const { createHash } = await import('node:crypto');
    const digest = createHash('sha256').update('original').digest('hex');
    rpc.mockReset()
      .mockResolvedValueOnce({ data: [{ id: draftId, version: 2, document_type: 'national_id', evidence_revision: 'a'.repeat(64), front_input_sha256: digest, back_input_sha256: createHash('sha256').update('backoriginal').digest('hex') }], error: null })
      .mockResolvedValueOnce({ data: draftId, error: null });
    const form = new FormData();
    form.set('draftId', draftId); form.set('version', '2'); form.set('frontFile', image); form.set('backFile', new File(['backoriginal'], 'back.jpg', { type: 'image/jpeg' }));
    const response = await POST(new Request('https://example.test/api/kyc/preview', { method: 'POST', body: form }));
    expect(response.status).toBe(200);
    expect(download).not.toHaveBeenCalled();
    expect(extract).toHaveBeenCalledWith(expect.objectContaining({ front: expect.objectContaining({ bytes: expect.any(Uint8Array) }) }));
    const supplied = extract.mock.calls[0]?.[0].front.bytes;
    expect(Buffer.from(supplied).toString()).toBe('clean:original');
  });


  it('rejects a different photo before OCR and never falls back to stored watermarked evidence', async () => {
    const form = new FormData(); form.set('draftId', draftId); form.set('version', '2');
    form.set('frontFile', new File(['changed'], 'front.jpg', { type: 'image/jpeg' }));
    form.set('backFile', new File(['backoriginal'], 'back.jpg', { type: 'image/jpeg' }));
    const response = await POST(formRequest(form));
    expect(response.status).toBe(409);
    expect(extract).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it('keeps full OCR output owner-only and stores only a server HMAC observation', async () => {
    const form = new FormData(); form.set('draftId', draftId); form.set('version', '2'); form.set('frontFile', new File(['original'], 'front.jpg', { type: 'image/jpeg' })); form.set('backFile', new File(['backoriginal'], 'back.jpg', { type: 'image/jpeg' }));
    const response = await POST(formRequest(form));
    const body = await response.json();
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body.data.preview).toEqual({ status: 'extracted', holderName: 'OCR Name', documentNumber: '900101-14-5678', expiryDate: null });
    expect(JSON.stringify(body)).not.toContain('internal-model');
    expect(rpc).toHaveBeenLastCalledWith('record_kyc_draft_ocr_observation_v2', expect.objectContaining({
      p_document_number_hmac: 'a'.repeat(64), p_document_number_last4: '5678', p_status: 'extracted',
    }));
    expect(admit).toHaveBeenCalledTimes(2);
  });

  it('returns a safe error when configured OCR is internally unavailable', async () => {
    extract.mockResolvedValue({ status: 'unavailable', holderName: null, documentNumber: null, expiryDate: null,
      confidence: null, providerModel: 'private', failureCode: 'service_auth', retryable: false });
    const form = new FormData(); form.set('draftId', draftId); form.set('version', '2'); form.set('frontFile', new File(['original'], 'front.jpg', { type: 'image/jpeg' })); form.set('backFile', new File(['backoriginal'], 'back.jpg', { type: 'image/jpeg' }));
    const response = await POST(formRequest(form));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('service_auth');
  });
});

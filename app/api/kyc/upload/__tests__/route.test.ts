import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const authenticatedRpc = vi.fn();
const serviceRpc = vi.fn();
const upload = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc: authenticatedRpc }),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: serviceRpc,
    storage: { from: () => ({ upload, remove: vi.fn() }) },
  }),
}));
vi.mock('@/lib/kyc/hash', () => ({
  hashICWithHmac: vi.fn().mockResolvedValue({ algorithm: 'hmac_sha256_v1', value: 'a'.repeat(64) }),
}));
vi.mock('@/lib/kyc/submission', () => ({
  validateKycUploadFile: vi.fn().mockResolvedValue({ ok: true, buffer: new ArrayBuffer(8) }),
  buildKycEvidencePaths: vi.fn().mockReturnValue({
    front: '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/front.jpg',
    back: '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/back.jpg',
  }),
  abandonAndRemoveKycEvidence: vi.fn(),
}));
vi.mock('@/lib/kyc/ocr', () => ({
  runKycOcr: vi.fn().mockResolvedValue({
    status: 'unavailable',
    holderName: null,
    documentNumberHmac: null,
    documentNumberLast4: null,
    expiryDate: null,
    confidence: null,
    mismatchFields: [],
    providerModel: 'test',
  }),
}));

const { POST } = await import('../route');

describe('POST /api/kyc/upload', () => {
  beforeEach(() => {
    getUser.mockReset();
    authenticatedRpc.mockReset();
    serviceRpc.mockReset();
    upload.mockReset();
    upload.mockResolvedValue({ error: null });
  });

  it('requires explicit consent before sending KYC images to Gemini OCR', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } });
    const form = new FormData();

    const response = await POST(new Request('http://localhost/api/kyc/upload', { method: 'POST', body: form }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'OCR_CONSENT_REQUIRED' } });
  });

  it('does not tell an independently eligible customer to complete Profile', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } });
    serviceRpc.mockResolvedValueOnce({ data: null, error: { message: 'tier_insufficient' } });
    const form = new FormData();
    form.set('ocrConsent', 'true');
    form.set('icNumber', '900101-14-5678');
    form.set('docType', 'national_id');
    form.set('frontFile', new File(['front'], 'front.jpg', { type: 'image/jpeg' }));
    form.set('backFile', new File(['back'], 'back.jpg', { type: 'image/jpeg' }));

    const response = await POST(new Request('http://localhost/api/kyc/upload', { method: 'POST', body: form }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: 'SUBMIT_FAILED' } });
    expect(JSON.stringify(body)).not.toContain('Complete your profile');
  });

  it('maps the existing active-submission conflict from a Supabase error object', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } });
    serviceRpc.mockResolvedValueOnce({ data: null, error: { message: 'active_submission_exists' } });
    const form = new FormData();
    form.set('ocrConsent', 'true');
    form.set('icNumber', '900101-14-5678');
    form.set('docType', 'national_id');
    form.set('frontFile', new File(['front'], 'front.jpg', { type: 'image/jpeg' }));
    form.set('backFile', new File(['back'], 'back.jpg', { type: 'image/jpeg' }));

    const response = await POST(new Request('http://localhost/api/kyc/upload', { method: 'POST', body: form }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'ACTIVE_SUBMISSION_EXISTS' } });
  });

  it.each([
    ['invalid_ic_fingerprint', 'INVALID_EVIDENCE'],
    ['invalid_document_type', 'INVALID_EVIDENCE'],
    ['invalid_document_path', 'INVALID_DOCUMENT_EVIDENCE'],
    ['documents_missing', 'INVALID_DOCUMENT_EVIDENCE'],
    ['invalid_document_mime', 'INVALID_DOCUMENT_EVIDENCE'],
  ])('maps %s without exposing an obsolete sequential prerequisite', async (message, code) => {
    getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } });
    serviceRpc.mockResolvedValueOnce({ data: null, error: { message } });
    const form = new FormData();
    form.set('ocrConsent', 'true');
    form.set('icNumber', '900101-14-5678');
    form.set('docType', 'national_id');
    form.set('frontFile', new File(['front'], 'front.jpg', { type: 'image/jpeg' }));
    form.set('backFile', new File(['back'], 'back.jpg', { type: 'image/jpeg' }));

    const response = await POST(new Request('http://localhost/api/kyc/upload', { method: 'POST', body: form }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });
});

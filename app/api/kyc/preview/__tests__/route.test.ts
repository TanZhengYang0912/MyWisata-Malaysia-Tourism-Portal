import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const rpc = vi.fn();
const download = vi.fn();
const admit = vi.fn().mockResolvedValue(true);
const extract = vi.fn();
const fingerprint = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc, storage: { from: () => ({ download }) } }) }));
vi.mock('@/lib/checkout/guest-session', () => ({ guestAddressRateKey: () => 'guest-address:127.0.0.1', reserveGuestRateLimit: admit }));
vi.mock('@/lib/operations/workload', () => ({
  withPortalWorkload: async (_scope: string, work: (signal: AbortSignal) => Promise<unknown>) => work(new AbortController().signal),
  WorkloadUnavailableError: class WorkloadUnavailableError extends Error { constructor(public code: 'busy' | 'unavailable') { super(code); } },
}));
vi.mock('@/lib/kyc/ocr', () => ({ extractKycPreviewFields: extract }));
vi.mock('@/lib/kyc/hash', () => ({ hashICWithHmac: fingerprint, normalizeIC: (value: string) => value.replace(/[-\s]/g, '').toUpperCase() }));

const { POST } = await import('../route');
const owner = '11111111-1111-4111-8111-111111111111';
const draftId = '22222222-2222-4222-8222-222222222222';

describe('/api/kyc/preview', () => {
  beforeEach(() => {
    vi.stubEnv('KYC_OCR_PREVIEW_ENABLED', 'true');
    vi.stubEnv('KYC_OCR_PREVIEW_USER_LIMIT', '3');
    vi.stubEnv('KYC_OCR_PREVIEW_IP_LIMIT', '10');
    vi.stubEnv('KYC_OCR_PREVIEW_RATE_WINDOW_SECONDS', '600');
    getUser.mockResolvedValue({ data: { user: { id: owner } } });
    rpc.mockReset()
      .mockResolvedValueOnce({ data: [{ id: draftId, version: 2, document_type: 'national_id', evidence_revision: 'a'.repeat(64) }], error: null })
      .mockResolvedValueOnce({ data: `${owner}/drafts/${draftId}/front.jpg`, error: null })
      .mockResolvedValueOnce({ data: `${owner}/drafts/${draftId}/back.jpg`, error: null })
      .mockResolvedValueOnce({ data: draftId, error: null });
    admit.mockReset().mockResolvedValue(true);
    download.mockReset().mockResolvedValue({ data: new Blob(['private'], { type: 'image/jpeg' }), error: null });
    extract.mockReset().mockResolvedValue({ status: 'extracted', holderName: 'OCR Name', documentNumber: '900101-14-5678', expiryDate: null,
      confidence: 0.9, providerModel: 'internal-model', failureCode: undefined });
    fingerprint.mockResolvedValue({ algorithm: 'hmac_sha256_v1', value: 'a'.repeat(64) });
  });

  it('keeps full OCR output owner-only and stores only a server HMAC observation', async () => {
    const response = await POST(new Request('https://example.test/api/kyc/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId, version: 2 }) }));
    const body = await response.json();
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body.data.preview).toEqual({ status: 'extracted', holderName: 'OCR Name', documentNumber: '900101-14-5678', expiryDate: null });
    expect(JSON.stringify(body)).not.toContain('internal-model');
    expect(rpc).toHaveBeenLastCalledWith('record_kyc_draft_ocr_observation', expect.objectContaining({
      p_document_number_hmac: 'a'.repeat(64), p_document_number_last4: '5678', p_status: 'extracted',
    }));
    expect(admit).toHaveBeenCalledTimes(2);
  });

  it('returns a safe error when configured OCR is internally unavailable', async () => {
    extract.mockResolvedValue({ status: 'unavailable', holderName: null, documentNumber: null, expiryDate: null,
      confidence: null, providerModel: 'private', failureCode: 'service_auth', retryable: false });
    const response = await POST(new Request('https://example.test/api/kyc/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId, version: 2 }) }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('service_auth');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const rpc = vi.fn();
const upload = vi.fn();
const remove = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc, storage: { from: () => ({ upload, remove }) } }) }));
vi.mock('@/lib/checkout/guest-session', () => ({ reserveGuestRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/operations/workload', () => ({
  withPortalWorkload: async (_scope: string, work: (signal: AbortSignal) => Promise<unknown>) => work(new AbortController().signal),
  WorkloadUnavailableError: class extends Error { code = 'busy'; },
}));
vi.mock('@/lib/kyc/submission', () => ({ validateKycUploadFile: vi.fn(async (file: File) => ({ ok: true, buffer: await file.arrayBuffer() })) }));
vi.mock('@/lib/kyc/evidence-image', () => ({ prepareKycEvidenceImage: vi.fn(async (bytes: Buffer) => ({ stored: Buffer.from(bytes), ocr: Buffer.from(bytes) })) }));

const { GET, POST } = await import('../route');
const owner = '11111111-1111-4111-8111-111111111111';
const draftId = '22222222-2222-4222-8222-222222222222';

describe('/api/kyc/draft', () => {
  beforeEach(() => {
    vi.stubEnv('KYC_DRAFT_IDLE_TTL_SECONDS', '600');
    vi.stubEnv('KYC_DRAFT_ABSOLUTE_TTL_SECONDS', '3600');
    getUser.mockResolvedValue({ data: { user: { id: owner } } });
    rpc.mockReset(); upload.mockReset().mockResolvedValue({ error: null }); remove.mockReset().mockResolvedValue({ error: null });
  });

  it('returns only owner-safe draft fields and sets no-store', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: draftId, version: 2, document_type: 'national_id', holder_name: 'A Person',
      front_storage_path: `${owner}/drafts/${draftId}/secret/front.jpg`, back_storage_path: `${owner}/drafts/${draftId}/secret/back.jpg`,
      evidence_revision: 'a'.repeat(64), expires_at: '2026-11-02T00:00:00Z', ocr_observation_id: draftId }], error: null });
    const response = await GET();
    const body = await response.json();
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body.data.draft).toMatchObject({ id: draftId, holderName: 'A Person', hasFront: true, hasBack: true });
    expect(JSON.stringify(body)).not.toContain('storage_path');
    expect(JSON.stringify(body)).not.toContain('ocrObservationId');
  });

  it('does not trust client-supplied OCR fields when saving a draft', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [{ draft_id: draftId, version: 1, expires_at: '2026-11-02T01:00:00Z', changed: true }], error: null });
    const form = new FormData();
    form.set('draftId', draftId); form.set('documentType', 'national_id'); form.set('holderName', 'A Person');
    form.set('frontFile', new File(['front image'], 'front.jpg', { type: 'image/jpeg' }));
    form.set('backFile', new File(['back image'], 'back.jpg', { type: 'image/jpeg' }));
    form.set('ocrDocumentNumber', '900101-14-5678'); form.set('ocrStatus', 'extracted'); form.set('ocrHolderName', 'Forged OCR');
    const response = await POST(new Request('https://example.test/api/kyc/draft', { method: 'POST', body: form }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const save = rpc.mock.calls.find(([name]) => name === 'save_kyc_draft_v2')?.[1];
    expect(save).toMatchObject({ p_front_input_sha256: expect.any(String), p_back_input_sha256: expect.any(String) });
    expect(JSON.stringify(save)).not.toContain('900101');
  });

  it('supports metadata-only draft saves without image uploads or watermark work', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: draftId, version: 2, document_type: 'national_id', holder_name: 'A Person',
      front_storage_path: `${owner}/drafts/${draftId}/front.jpg`, back_storage_path: `${owner}/drafts/${draftId}/back.jpg`,
      front_input_sha256: 'a'.repeat(64), back_input_sha256: 'b'.repeat(64), front_evidence_sha256: 'c'.repeat(64),
      back_evidence_sha256: 'd'.repeat(64), evidence_revision: 'e'.repeat(64) }], error: null });
    rpc.mockResolvedValueOnce({ data: [{ draft_id: draftId, version: 3, expires_at: '2026-11-02T01:00:00Z', changed: true }], error: null });
    const form = new FormData();
    form.set('draftId', draftId); form.set('version', '2'); form.set('documentType', 'national_id');
    form.set('holderName', 'Corrected Name'); form.set('reuseFront', 'true'); form.set('reuseBack', 'true');
    const response = await POST(new Request('https://example.test/api/kyc/draft', { method: 'POST', body: form }));
    expect(response.status).toBe(200);
    expect(upload).not.toHaveBeenCalled();
    const save = rpc.mock.calls.find(([name]) => name === 'save_kyc_draft_v2')?.[1];
    expect(save).toMatchObject({ p_front_storage_path: `${owner}/drafts/${draftId}/front.jpg`, p_back_storage_path: `${owner}/drafts/${draftId}/back.jpg` });
  });
});

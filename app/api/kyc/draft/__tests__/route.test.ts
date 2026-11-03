import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const rpc = vi.fn();
const upload = vi.fn();
const remove = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc, storage: { from: () => ({ upload, remove }) } }) }));
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
    rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [{ draft_id: draftId, version: 1, expires_at: '2026-11-02T01:00:00Z' }], error: null });
    const form = new FormData();
    form.set('draftId', draftId); form.set('documentType', 'national_id'); form.set('holderName', 'A Person');
    form.set('frontFile', new File(['front image'], 'front.jpg', { type: 'image/jpeg' }));
    form.set('backFile', new File(['back image'], 'back.jpg', { type: 'image/jpeg' }));
    form.set('ocrDocumentNumber', '900101-14-5678'); form.set('ocrStatus', 'extracted'); form.set('ocrHolderName', 'Forged OCR');
    const response = await POST(new Request('https://example.test/api/kyc/draft', { method: 'POST', body: form }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const save = rpc.mock.calls.find(([name]) => name === 'save_kyc_draft')?.[1];
    expect(save).toMatchObject({ p_ocr_number_hmac: null, p_ocr_holder_name: null, p_ocr_status: null });
    expect(JSON.stringify(save)).not.toContain('900101');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const rpc = vi.fn();
const upload = vi.fn();
const download = vi.fn();
const remove = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc,
  from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }),
  storage: { from: () => ({ upload, remove, download }) } }) }));
vi.mock('@/lib/checkout/guest-session', () => ({ guestAddressRateKey: () => 'guest-address:127.0.0.1', reserveGuestRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/operations/workload', () => ({
  withPortalWorkload: async (_scope: string, work: (signal: AbortSignal) => Promise<unknown>) => work(new AbortController().signal),
  WorkloadUnavailableError: class extends Error { code = 'busy'; },
}));
vi.mock('@/lib/kyc/submission', () => ({
  validateKycUploadFile: vi.fn(async (file: File) => ({ ok: true, buffer: await file.arrayBuffer() })),
  createKycEvidenceRevision: vi.fn(() => 'f'.repeat(64)),
}));
vi.mock('@/lib/kyc/evidence-image', () => ({ prepareKycEvidenceImage: vi.fn(async (bytes: Buffer) => ({ stored: Buffer.concat([Buffer.from('watermarked:'),bytes]), ocr: Buffer.concat([Buffer.from('clean:'),bytes]) })) }));
vi.mock('@/lib/kyc/ocr', () => ({ extractKycPreviewFields: vi.fn().mockResolvedValue({ status: 'extracted', holderName: 'LI WEI MING', documentNumber: 'EA1234567', expiryDate: '2030-01-01',
  confidence: 0.9, providerModel: 'local-test', issuerCountry: 'CN', nationality: 'CN', mrzStatus: 'valid', visualComparisonStatus: 'consistent' }) }));
vi.mock('@/lib/kyc/hash', () => ({ hashICWithHmac: vi.fn().mockResolvedValue({ algorithm: 'hmac_sha256_v1', value: 'a'.repeat(64) }) }));

const { GET, POST } = await import('../route');
const { extractKycPreviewFields } = await import('@/lib/kyc/ocr');
const owner = '11111111-1111-4111-8111-111111111111';
const draftId = '22222222-2222-4222-8222-222222222222';

describe('/api/kyc/draft', () => {
  beforeEach(() => {
    vi.stubEnv('KYC_DRAFT_IDLE_TTL_SECONDS', '600');
    vi.stubEnv('KYC_DRAFT_ABSOLUTE_TTL_SECONDS', '3600');
    vi.stubEnv('KYC_CLEAN_OCR_ENABLED','true'); vi.stubEnv('KYC_OCR_PREVIEW_ENABLED','true');
    vi.stubEnv('KYC_CHINESE_PASSPORT_OCR_ENABLED','true'); vi.stubEnv('KYC_IC_HMAC_KEY','test-hmac-secret');
    vi.stubEnv('KYC_OCR_PREVIEW_USER_LIMIT','3'); vi.stubEnv('KYC_OCR_PREVIEW_IP_LIMIT','10'); vi.stubEnv('KYC_OCR_PREVIEW_RATE_WINDOW_SECONDS','600');
    getUser.mockResolvedValue({ data: { user: { id: owner } } });
    rpc.mockReset(); upload.mockReset().mockResolvedValue({ error: null }); download.mockReset().mockResolvedValue({ data: null, error: new Error('not found') }); remove.mockReset().mockResolvedValue({ error: null });
    vi.mocked(extractKycPreviewFields).mockClear();
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

  it('disables capture and unsupported enforcement configuration in safe capabilities', async () => {
    vi.stubEnv('KYC_DOCUMENT_CAPTURE_ENABLED','false'); vi.stubEnv('KYC_DOCUMENT_QUALITY_MODE','enforce');
    rpc.mockResolvedValueOnce({data:[],error:null});
    const response=await GET();
    await expect(response.json()).resolves.toMatchObject({data:{draft:null,capabilities:{documentCapture:false,qualityMode:'off',cleanOcr:true,chinesePassportOcr:true}}});
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

  it('saves a Chinese passport draft with one page and no back-side object', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [{ draft_id: draftId, version: 1, expires_at: '2026-11-02T01:00:00Z', changed: true }], error: null });
    const form = new FormData();
    form.set('draftId', draftId); form.set('documentType', 'passport'); form.set('holderName', 'LI WEI MING');
    form.set('frontFile', new File(['passport page'], 'passport.jpg', { type: 'image/jpeg' }));
    const response = await POST(new Request('https://example.test/api/kyc/draft', { method: 'POST', body: form }));
    expect(response.status).toBe(200);
    const save = rpc.mock.calls.find(([name]) => name === 'save_kyc_draft_v2')?.[1];
    expect(save).toMatchObject({ p_document_type: 'passport', p_back_storage_path: null, p_back_evidence_sha256: null });
    expect(JSON.stringify(save)).not.toContain('/back.');
  });

  it('cleans newly uploaded evidence when the save RPC returns no row', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [], error: null });
    const form = new FormData();
    form.set('draftId', draftId); form.set('documentType', 'passport'); form.set('holderName', 'LI WEI MING');
    form.set('frontFile', new File(['passport page'], 'passport.jpg', { type: 'image/jpeg' }));
    const response = await POST(new Request('https://example.test/api/kyc/draft', { method: 'POST', body: form }));
    expect(response.status).toBe(503);
    expect(remove).toHaveBeenCalledOnce();
    expect(remove.mock.calls[0][0]).toHaveLength(1);
  });

  it('saves and recognizes each original photo in one request using clean bytes only for OCR', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: { status: 'claimed', leaseToken: '33333333-3333-4333-8333-333333333333' }, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: [{ draft_id: draftId, version: 1, expires_at: '2026-11-02T01:00:00Z', changed: true }], error: null })
      .mockResolvedValueOnce({ data: { status: 'succeeded', draftVersion: 1 }, error: null });
    const form = new FormData();
    form.set('intent','save_and_recognize'); form.set('operationId','44444444-4444-4444-8444-444444444444'); form.set('ocrConsent','true');
    form.set('draftId',draftId); form.set('documentType','passport'); form.set('holderName','LI WEI MING');
    form.set('frontFile',new File(['passport page'],'passport.jpg',{type:'image/jpeg'}));
    const response=await POST(new Request('https://example.test/api/kyc/draft',{method:'POST',body:form}));
    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(Buffer.from(upload.mock.calls[0][1]).toString()).toBe('watermarked:passport page');
    expect(extractKycPreviewFields).toHaveBeenCalledWith(expect.objectContaining({front:expect.objectContaining({bytes:expect.any(Uint8Array)})}));
    const ocrInput=vi.mocked(extractKycPreviewFields).mock.calls[0][0];
    expect(Buffer.from(ocrInput.front.bytes).toString()).toBe('clean:passport page');
    expect(rpc).toHaveBeenCalledWith('claim_kyc_draft_ocr_operation',expect.objectContaining({p_operation_id:'44444444-4444-4444-8444-444444444444'}));
    expect(rpc).toHaveBeenCalledWith('register_kyc_draft_ocr_staging_paths',expect.objectContaining({p_storage_paths:[`${owner}/drafts/${draftId}/staging/44444444-4444-4444-8444-444444444444/front.jpg`]}));
    expect(rpc).toHaveBeenCalledWith('complete_kyc_draft_ocr_operation_v2',expect.objectContaining({p_status:'extracted',p_document_number_hmac:'a'.repeat(64)}));
    await expect(response.json()).resolves.toMatchObject({data:{draft:{id:draftId,version:1},preview:{holderName:'LI WEI MING'}}});
  });

  it('does not upload or run OCR when the same operation is already processing', async () => {
    rpc.mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:{status:'processing'},error:null});
    const form=new FormData(); form.set('intent','save_and_recognize'); form.set('operationId','44444444-4444-4444-8444-444444444444');
    form.set('ocrConsent','true'); form.set('draftId',draftId); form.set('documentType','passport'); form.set('holderName','LI WEI MING');
    form.set('frontFile',new File(['passport page'],'passport.jpg',{type:'image/jpeg'}));
    const response=await POST(new Request('https://example.test/api/kyc/draft',{method:'POST',body:form}));
    expect(response.status).toBe(409); expect(upload).not.toHaveBeenCalled();
  });

  it('processes both MyKad sides in one recognition operation', async () => {
    rpc.mockResolvedValueOnce({data:[],error:null})
      .mockResolvedValueOnce({data:{status:'claimed',leaseToken:'33333333-3333-4333-8333-333333333333'},error:null})
      .mockResolvedValueOnce({data:true,error:null})
      .mockResolvedValueOnce({data:[{draft_id:draftId,version:1,expires_at:'2026-11-02T01:00:00Z',changed:true}],error:null})
      .mockResolvedValueOnce({data:{status:'succeeded',draftVersion:1},error:null});
    const form=new FormData(); form.set('intent','save_and_recognize'); form.set('operationId','44444444-4444-4444-8444-444444444444');
    form.set('ocrConsent','true'); form.set('draftId',draftId); form.set('documentType','national_id'); form.set('holderName','A Person');
    form.set('frontFile',new File(['front'],'front.jpg',{type:'image/jpeg'}));
    form.set('backFile',new File(['back'],'back.jpg',{type:'image/jpeg'}));
    const response=await POST(new Request('https://example.test/api/kyc/draft',{method:'POST',body:form}));
    expect(response.status).toBe(200); expect(upload).toHaveBeenCalledTimes(2);
    const images=vi.mocked(extractKycPreviewFields).mock.calls[0][0];
    expect(Buffer.from(images.front.bytes).toString()).toBe('clean:front');
    expect(Buffer.from(images.back!.bytes).toString()).toBe('clean:back');
    expect(upload.mock.calls.map((call)=>Buffer.from(call[1]).toString()).sort()).toEqual(['watermarked:back','watermarked:front']);
  });

  it('fails closed when clean OCR is disabled while leaving ordinary draft saving available', async () => {
    vi.stubEnv('KYC_CLEAN_OCR_ENABLED','false');
    rpc.mockResolvedValueOnce({data:[],error:null});
    const form=new FormData(); form.set('intent','save_and_recognize'); form.set('operationId','44444444-4444-4444-8444-444444444444');
    form.set('ocrConsent','true'); form.set('draftId',draftId); form.set('documentType','passport'); form.set('holderName','LI WEI MING');
    form.set('frontFile',new File(['passport page'],'passport.jpg',{type:'image/jpeg'}));
    const response=await POST(new Request('https://example.test/api/kyc/draft',{method:'POST',body:form}));
    expect(response.status).toBe(503); expect(upload).not.toHaveBeenCalled();
  });
});

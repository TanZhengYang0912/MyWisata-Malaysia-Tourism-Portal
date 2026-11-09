import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareKycEvidenceImage } from '@/lib/kyc/evidence-image';
import { abandonAndRemoveKycEvidence } from '@/lib/kyc/submission';
import { runKycOcr } from '@/lib/kyc/ocr';

vi.mock('@/lib/operations/workload', () => ({ withPortalWorkload: async (_scope: string, work: (signal: AbortSignal) => Promise<unknown>) => work(new AbortController().signal), WorkloadUnavailableError: class extends Error {} }));
vi.mock('@/lib/checkout/guest-session', () => ({ reserveGuestRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/kyc/evidence-image', () => ({ prepareKycEvidenceImage: vi.fn(async (bytes: Buffer) => ({ ocr: Buffer.from(`clean:${bytes.toString()}`), stored: Buffer.from(`watermarked:${bytes.toString()}`) })) }));

const getUser = vi.fn();
const authenticatedRpc = vi.fn();
const serviceRpc = vi.fn();
const upload = vi.fn();
const download = vi.fn();
const activeLookup = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc: authenticatedRpc }),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: serviceRpc,
    from: () => ({ select: () => ({ eq: () => ({ in: () => ({ limit: activeLookup }) }) }) }),
    storage: { from: () => ({ upload, remove: vi.fn(), download }) },
  }),
}));
vi.mock('@/lib/kyc/hash', () => ({
  hashICWithHmac: vi.fn().mockResolvedValue({ algorithm: 'hmac_sha256_v1', value: 'a'.repeat(64) }),
  normalizeIC: (value: string) => value.replace(/[-\s]/g, '').toUpperCase(),
}));
vi.mock('@/lib/kyc/submission', () => ({
  validateKycUploadFile: vi.fn(async (file: File) => ({ ok: true, buffer: await file.arrayBuffer() })),
  hasDuplicateKycDocumentSides: (front: string | null, back: string | null) => Boolean(front && back && front === back),
  createKycEvidenceRevision: vi.fn(() => 'f'.repeat(64)),
  buildKycEvidencePaths: vi.fn((_owner: string, _submission: string, _token: string, _frontMime: string, backMime: string | null) => ({
    front: '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/front.jpg',
    back: backMime ? '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/back.jpg' : null,
  })),
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
    vi.mocked(prepareKycEvidenceImage).mockReset().mockImplementation(async (bytes: Buffer) => ({ ocr: Buffer.from(`clean:${bytes.toString()}`), stored: Buffer.from(`watermarked:${bytes.toString()}`) }));
    vi.mocked(abandonAndRemoveKycEvidence).mockReset().mockResolvedValue({ ok: true });
    activeLookup.mockReset().mockResolvedValue({data:[],error:null});
    getUser.mockReset();
    authenticatedRpc.mockReset();
    serviceRpc.mockReset();
    upload.mockReset();
    upload.mockResolvedValue({ error: null });
    download.mockReset().mockResolvedValue({ data: new Blob(['watermarked'], { type: 'image/jpeg' }), error: null });
  });

  it('stores only watermarked evidence and defers OCR until after durable finalization', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } });
    serviceRpc.mockResolvedValueOnce({ data: { submissionId: '33333333-3333-4333-8333-333333333333', state: 'processing' }, error: null }).mockResolvedValue({ error: null });
    authenticatedRpc.mockResolvedValue({ error: null });
    const form = new FormData();
    form.set('ocrConsent', 'true'); form.set('holderName', 'Example Holder');
    form.set('operationId', '44444444-4444-4444-8444-444444444444');
    form.set('icNumber', '900101-14-5678');
    form.set('docType', 'national_id');
    form.set('frontFile', new File(['front'], 'front.jpg', { type: 'image/jpeg' }));
    form.set('backFile', new File(['back'], 'back.jpg', { type: 'image/jpeg' }));
    const response = await POST(new Request('http://localhost/api/kyc/upload', { method: 'POST', body: form }));
    expect(response.status).toBe(201);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls.map((call) => Buffer.from(call[1]).toString()).sort()).toEqual(['watermarked:back', 'watermarked:front']);
    expect(runKycOcr).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalledWith('record_kyc_ocr_result', expect.anything());
    expect(authenticatedRpc).toHaveBeenCalledWith('finalize_kyc_submission', expect.anything());
    await expect(response.json()).resolves.toMatchObject({ data: { status: 'pending', ocrStatus: 'queued', manualReviewRequired: true } });
  });

  it('rejects identical MyKad sides before beginning a submission', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } });
    const form = new FormData();
    form.set('ocrConsent', 'true'); form.set('holderName', 'Example Holder'); form.set('operationId', '44444444-4444-4444-8444-444444444444');
    form.set('icNumber', '900101-14-5678'); form.set('docType', 'national_id');
    form.set('frontFile', new File(['same photo'], 'front.jpg', { type: 'image/jpeg' }));
    form.set('backFile', new File(['same photo'], 'renamed.jpg', { type: 'image/jpeg' }));
    const response = await POST(new Request('http://localhost/api/kyc/upload', { method: 'POST', body: form }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'DUPLICATE_DOCUMENT_SIDES' } });
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('submits the exact saved draft evidence without reprocessing or trusting client paths', async () => {
    const owner = '11111111-1111-4111-8111-111111111111';
    const draftId = '22222222-2222-4222-8222-222222222222';
    const submissionId = '33333333-3333-4333-8333-333333333333';
    const operationId = '44444444-4444-4444-8444-444444444444';
    getUser.mockResolvedValue({ data: { user: { id: owner } } });
    serviceRpc.mockResolvedValueOnce({ data: [{ id: draftId, version: 2, document_type: 'national_id', holder_name: 'Example Holder', evidence_revision: 'f'.repeat(64), ocr_source_revision: null }], error: null })
      .mockResolvedValueOnce({ data: `${owner}/drafts/${draftId}/object/front.jpg`, error: null })
      .mockResolvedValueOnce({ data: `${owner}/drafts/${draftId}/object/back.jpg`, error: null })
      .mockResolvedValueOnce({ data: { submissionId, state: 'processing' }, error: null })
      .mockResolvedValue({ error: null });
    download.mockResolvedValueOnce({ data: new Blob(['front stored'], { type: 'image/jpeg' }), error: null })
      .mockResolvedValueOnce({ data: new Blob(['back stored'], { type: 'image/jpeg' }), error: null });
    authenticatedRpc.mockResolvedValue({ error: null });
    const form = new FormData();
    for (const [key, value] of Object.entries({ ocrConsent: 'true', holderName: 'Example Holder', operationId, draftId, draftVersion: '2', docType: 'national_id', icNumber: '900101-14-5678' })) form.set(key, value);
    const response = await POST(new Request('http://localhost/api/kyc/upload', { method: 'POST', headers: { 'Idempotency-Key': operationId }, body: form }));
    expect(response.status).toBe(201);
    expect(download).toHaveBeenCalledTimes(2);
    expect(prepareKycEvidenceImage).not.toHaveBeenCalled();
    expect(upload.mock.calls.map((call) => Buffer.from(call[1]).toString()).sort()).toEqual(['back stored', 'front stored']);
    expect(authenticatedRpc).toHaveBeenCalledWith('finalize_kyc_submission_with_ocr_v2', expect.objectContaining({
      p_draft_id: draftId, p_draft_revision: 'f'.repeat(64), p_source_revision: null, p_operation_id: operationId,
    }));
    expect(serviceRpc).not.toHaveBeenCalledWith('mark_kyc_draft_submitted', expect.anything());
  });

  it('submits a Chinese passport with one front page and finalizes without a back path', async () => {
    const owner = '11111111-1111-4111-8111-111111111111';
    const submissionId = '33333333-3333-4333-8333-333333333333';
    const operationId = '44444444-4444-4444-8444-444444444444';
    getUser.mockResolvedValue({ data: { user: { id: owner } } });
    serviceRpc.mockResolvedValueOnce({ data: { submissionId, state: 'processing' }, error: null }).mockResolvedValue({ error: null });
    authenticatedRpc.mockResolvedValue({ error: null });
    const form = new FormData();
    for (const [key, value] of Object.entries({ ocrConsent: 'true', holderName: 'LI WEI MING', operationId, icNumber: 'EA1234567', docType: 'passport' })) form.set(key, value);
    form.set('frontFile', new File(['passport page'], 'passport.jpg', { type: 'image/jpeg' }));
    const response = await POST(new Request('http://localhost/api/kyc/upload', { method: 'POST', body: form }));
    expect(response.status).toBe(201);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(authenticatedRpc).toHaveBeenCalledWith('finalize_kyc_submission', expect.objectContaining({ p_back_path: null }));
  });

  it('rejects undecodable photos without superseding an earlier information request', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } });
    serviceRpc.mockResolvedValueOnce({ data: { submissionId: '33333333-3333-4333-8333-333333333333', state: 'processing' }, error: null });
    vi.mocked(prepareKycEvidenceImage).mockRejectedValueOnce(new Error('invalid image'));
    const form = new FormData();
    form.set('ocrConsent', 'true'); form.set('holderName', 'Example Holder'); form.set('operationId', '44444444-4444-4444-8444-444444444444'); form.set('icNumber', '900101-14-5678'); form.set('docType', 'national_id');
    form.set('frontFile', new File(['fake'], 'front.jpg', { type: 'image/jpeg' }));
    form.set('backFile', new File(['fake'], 'back.jpg', { type: 'image/jpeg' }));
    const response = await POST(new Request('http://localhost/api/kyc/upload', { method: 'POST', body: form }));
    expect(response.status).toBe(422);
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(abandonAndRemoveKycEvidence).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
  });

  it('requires consent for private document processing', async () => {
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
    form.set('holderName', 'Example Holder');
    form.set('operationId', '44444444-4444-4444-8444-444444444444');
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
    form.set('holderName', 'Example Holder');
    form.set('operationId', '44444444-4444-4444-8444-444444444444');
    form.set('icNumber', '900101-14-5678');
    form.set('docType', 'national_id');
    form.set('frontFile', new File(['front'], 'front.jpg', { type: 'image/jpeg' }));
    form.set('backFile', new File(['back'], 'back.jpg', { type: 'image/jpeg' }));

    const response = await POST(new Request('http://localhost/api/kyc/upload', { method: 'POST', body: form }));

    expect(abandonAndRemoveKycEvidence).not.toHaveBeenCalled();
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
    form.set('holderName', 'Example Holder');
    form.set('operationId', '44444444-4444-4444-8444-444444444444');
    form.set('icNumber', '900101-14-5678');
    form.set('docType', 'national_id');
    form.set('frontFile', new File(['front'], 'front.jpg', { type: 'image/jpeg' }));
    form.set('backFile', new File(['back'], 'back.jpg', { type: 'image/jpeg' }));

    const response = await POST(new Request('http://localhost/api/kyc/upload', { method: 'POST', body: form }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });
  function request() {
    const body = new FormData();
    for (const [key,value] of Object.entries({ocrConsent:'true',holderName:'Example Holder',operationId:'44444444-4444-4444-8444-444444444444',docType:'national_id',icNumber:'900101-14-5678'})) body.set(key,value);
    body.set('frontFile',new File(['front'],'front.jpg',{type:'image/jpeg'}));
    body.set('backFile',new File(['back'],'back.jpg',{type:'image/jpeg'}));
    return new Request('http://localhost/api/kyc/upload',{method:'POST',headers:{'Idempotency-Key':'44444444-4444-4444-8444-444444444444'},body});
  }
  it('rejects a known active case before parsing or recoding photos', async () => {
    getUser.mockResolvedValue({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}});
    activeLookup.mockResolvedValue({data:[{id:'active'}],error:null});
    const input=request(); const parse=vi.spyOn(input,'formData');
    expect((await POST(input)).status).toBe(409);
    expect(parse).not.toHaveBeenCalled(); expect(prepareKycEvidenceImage).not.toHaveBeenCalled(); expect(serviceRpc).not.toHaveBeenCalled();
  });
  it('lets the exact owner operation reconcile its already-bound active submission', async () => {
    const owner='11111111-1111-4111-8111-111111111111';
    const submissionId='33333333-3333-4333-8333-333333333333';
    const operationId='44444444-4444-4444-8444-444444444444';
    getUser.mockResolvedValue({data:{user:{id:owner}}});
    authenticatedRpc.mockResolvedValue({data:{operationId,state:'processing',submissionId,submissionStatus:'pending'},error:null});
    activeLookup.mockResolvedValue({data:[{id:submissionId}],error:null});
    serviceRpc.mockResolvedValue({data:{submissionId,state:'processing'},error:null});
    const response=await POST(request());
    expect(response.status).toBe(201);
    expect(serviceRpc).toHaveBeenCalledWith('begin_kyc_submission_v2',expect.objectContaining({p_operation_id:operationId,p_user_id:owner}));
  });
  it('fails closed when the early status lookup is unavailable', async () => {
    getUser.mockResolvedValue({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}});
    activeLookup.mockResolvedValue({data:null,error:{message:'private database detail'}});
    expect((await POST(request())).status).toBe(503);
    expect(prepareKycEvidenceImage).not.toHaveBeenCalled();
  });
  it('abandons only this draft when Storage throws', async () => {
    getUser.mockResolvedValue({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}});
    serviceRpc.mockResolvedValue({data:{submissionId:'33333333-3333-4333-8333-333333333333',state:'processing'},error:null});
    upload.mockRejectedValueOnce(new Error('secret storage path'));
    const response=await POST(request());
    expect(response.status).toBe(502); expect(abandonAndRemoveKycEvidence).toHaveBeenCalledOnce();
    expect(await response.text()).not.toContain('secret');
  });
  it('preserves evidence when finalization outcome and abandonment are uncertain', async () => {
    getUser.mockResolvedValue({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}});
    serviceRpc.mockResolvedValue({data:{submissionId:'33333333-3333-4333-8333-333333333333',state:'processing'},error:null});
    authenticatedRpc.mockResolvedValueOnce({data:null,error:null}).mockRejectedValueOnce(new Error('timeout'));
    vi.mocked(abandonAndRemoveKycEvidence).mockResolvedValue({ok:false,reason:'draft_not_abandoned'});
    const response=await POST(request()); expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({error:{code:'CLEANUP_FAILED'}});
  });

});

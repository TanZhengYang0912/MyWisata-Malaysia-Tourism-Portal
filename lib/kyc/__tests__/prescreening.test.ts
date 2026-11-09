import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ run: vi.fn(), config: vi.fn(), rpc: vi.fn(), download: vi.fn() }));
vi.mock('@/lib/kyc/ocr', () => ({ runKycOcr: mocks.run, privateKycOcrConfiguration: mocks.config, kycOcrRuntimeConfiguration: mocks.config }));
import { processKycPrescreening } from '../prescreening';
const service = { rpc: mocks.rpc, storage: { from: () => ({ download: mocks.download }) } };
const observation = { status: 'extracted', sourceRevision: 'source-v1', artifactRevision: 'evidence-v1', holderName: 'Aina', documentNumberHmac: 'a'.repeat(64), documentNumberLast4: '1234', expiryDate: null, confidence: 0.9, issuerCountry: null, nationality: null, mrzStatus: null, visualComparisonStatus: null, engine: 'private-ocr-v1' };
beforeEach(() => {
  vi.stubEnv('KYC_PRESCREENING_DRAIN_ENABLED', 'false');
  vi.stubEnv('KYC_PRESCREENING_ENABLED', 'true');
  vi.stubEnv('KYC_PRESCREENING_BATCH_SIZE', '2'); vi.stubEnv('KYC_PRESCREENING_MAX_RUNNING', '2');
  vi.stubEnv('KYC_PRESCREENING_LEASE_SECONDS', '60'); vi.stubEnv('KYC_PRESCREENING_MAX_ATTEMPTS', '2');
  vi.stubEnv('KYC_PRESCREENING_RETRY_SECONDS', '60'); vi.stubEnv('KYC_IC_HMAC_KEY', 'test-hmac-key');
  vi.stubEnv('KYC_PRIVATE_OCR_MIN_CONFIDENCE', '');
  mocks.config.mockReturnValue({ engine: 'private-http', timeoutMs: 1000 }); mocks.rpc.mockReset(); mocks.run.mockReset();
  mocks.download.mockReset().mockResolvedValue({ data: new Blob(['watermarked'], { type: 'image/jpeg' }), error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function job() { return { id: 'job-id', submissionId: 'case-id', leaseToken: 'token', evidenceRevision: 'evidence-v1', documentType: 'national_id', expectedDocumentNumberHmac: 'a'.repeat(64), expectedHolderName: 'Aina', documents: [{side:'front',path:'private/front.jpg',mimeType:'image/jpeg'},{side:'back',path:'private/back.jpg',mimeType:'image/jpeg'}] }; }
describe('private async pre-screening', () => {
  it('does not claim work when operator budgets or private runtime are missing', async () => {
    vi.stubEnv('KYC_PRESCREENING_LEASE_SECONDS', '');
    expect(await processKycPrescreening(service as never)).toMatchObject({ enabled: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('never treats uncalibrated confidence as a passed precheck and never exposes paths', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [job()], error: null }).mockResolvedValueOnce({ data: observation, error: null }).mockResolvedValue({ data: true, error: null });
    const summary = await processKycPrescreening(service as never);
    expect(summary).toMatchObject({ enabled: true, claimed: 1, acknowledged: 1, ocrProcessed: 1, unavailable: 0 });
    expect(JSON.stringify(summary)).not.toContain('private/');
    expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_kyc_prescreening_job', expect.objectContaining({ p_token:'token', p_result:expect.objectContaining({ status:'mismatch',mismatchFields:['confidence_unvalidated'] }) }));
  });
  it('missing evidence stays manual and cannot be mistaken for a user rejection', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [job()], error: null }).mockResolvedValueOnce({ data: null, error: null }).mockResolvedValue({ data: true, error: null });
    const summary = await processKycPrescreening(service as never);
    expect(summary).toMatchObject({ acknowledged: 1, ocrProcessed: 1, unavailable: 0 });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_kyc_prescreening_job',expect.objectContaining({p_result:expect.objectContaining({status:'unreadable',mismatchFields:['ocr_source_unavailable']})}));
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('does not report a stale completion as saved', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [job()], error: null }).mockResolvedValueOnce({ data: observation, error: null }).mockResolvedValue({ data: false, error: null });
    expect(await processKycPrescreening(service as never)).toMatchObject({ acknowledged:0, ocrProcessed:0, unavailable:0, notAcknowledged:1 });
  });
  it('does not label finish RPC transport errors as terminal job failures', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [job()], error: null }).mockResolvedValueOnce({ data: observation, error: null }).mockResolvedValue({ data: null, error: new Error('private database detail') });
    expect(await processKycPrescreening(service as never)).toMatchObject({ acknowledged:0, writeErrors:1 });
  });
});


describe('bounded drain', () => {
  function drain() {
    vi.stubEnv('KYC_PRESCREENING_DRAIN_ENABLED','true');
    vi.stubEnv('KYC_PRESCREENING_DRAIN_MAX_BATCHES','3');
    vi.stubEnv('KYC_PRESCREENING_DRAIN_BUDGET_MS','10000');
  }
  it('claims another batch within explicit budgets and stops on empty queue', async () => {
    drain();
    let claims = 0; mocks.rpc.mockImplementation(async (name: string) => name === 'claim_kyc_prescreening_jobs' ? {data: claims++ ? [] : [job()], error:null} : name === 'get_kyc_submission_ocr_observation_v2' ? {data: observation,error:null} : {data:true,error:null});
    expect(await processKycPrescreening(service as never)).toMatchObject({claimed:1,batches:1,stopReason:'empty'});
    expect(mocks.rpc.mock.calls.filter(([name]) => name==='claim_kyc_prescreening_jobs')).toHaveLength(2);
  });
  it('stops after an unavailable engine instead of consuming more jobs', async () => {
    drain(); mocks.rpc.mockResolvedValueOnce({data:[job()],error:null}).mockResolvedValueOnce({data:null,error:new Error('service unavailable')}).mockResolvedValue({data:true,error:null});
    mocks.rpc.mockResolvedValueOnce({data:[job()],error:null}).mockResolvedValueOnce({data:observation,error:null}).mockResolvedValue({data:true,error:null});
    expect(await processKycPrescreening(service as never)).toMatchObject({batches:1,stopReason:'service_unavailable'});
  });
  it('does not start work when configured drain time cannot contain one batch', async () => {
    drain(); vi.stubEnv('KYC_PRESCREENING_DRAIN_BUDGET_MS','1');
    expect(await processKycPrescreening(service as never)).toMatchObject({enabled:false});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});


describe('drain boundaries and evidence failures', () => {
  function drain() {
    vi.stubEnv('KYC_PRESCREENING_DRAIN_ENABLED','true'); vi.stubEnv('KYC_PRESCREENING_DRAIN_MAX_BATCHES','2'); vi.stubEnv('KYC_PRESCREENING_DRAIN_BUDGET_MS','10000');
  }
  it('never exceeds configured batch count', async () => {
    drain(); let claims = 0; mocks.rpc.mockImplementation(async(name:string)=>({data:name==='claim_kyc_prescreening_jobs'?(claims++<2?[job()]:[]):name==='get_kyc_submission_ocr_observation_v2'?observation:true,error:null}));
    expect(await processKycPrescreening(service as never)).toMatchObject({claimed:2,batches:2,stopReason:'max_batches'});
  });
  it('does not claim the next batch after its time budget expires', async () => {
    drain(); vi.spyOn(performance,'now').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(9999);
    let claims = 0; mocks.rpc.mockImplementation(async(name:string)=>({data:name==='claim_kyc_prescreening_jobs'?(claims++<2?[job()]:[]):name==='get_kyc_submission_ocr_observation_v2'?observation:true,error:null}));
    expect(await processKycPrescreening(service as never)).toMatchObject({claimed:1,stopReason:'time_budget'});
  });
  it('stops claiming after a finish write fails', async () => {
    drain(); mocks.rpc.mockResolvedValueOnce({data:[job()],error:null}).mockResolvedValue({data:null,error:new Error('private detail')});
    expect(await processKycPrescreening(service as never)).toMatchObject({writeErrors:1,stopReason:'write_error',batches:1});
  });
  it('marks missing immutable evidence permanent, without exposing the path', async () => {
    mocks.rpc.mockResolvedValueOnce({data:[job()],error:null}).mockResolvedValueOnce({data:null,error:null}).mockResolvedValue({data:true,error:null});
    const summary=await processKycPrescreening(service as never);
    expect(summary.failureCounts).toEqual({});
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_kyc_prescreening_job',expect.objectContaining({p_result:expect.objectContaining({status:'unreadable',mismatchFields:['ocr_source_unavailable']})}));
    expect(mocks.download).not.toHaveBeenCalled();
    expect(JSON.stringify(summary)).not.toContain('storage');
  });
});


describe('Node queue admission', () => {
  function nodeMode() {
    mocks.config.mockReturnValue({ engine: 'tesseract-js', timeoutMs: 1000 });
    vi.stubEnv('KYC_PRESCREENING_BATCH_SIZE', '1'); vi.stubEnv('KYC_PRESCREENING_MAX_RUNNING', '1');
  }
  it('rejects Node batch expansion before claim or download', async () => {
    nodeMode(); vi.stubEnv('KYC_PRESCREENING_BATCH_SIZE', '2');
    expect(await processKycPrescreening(service as never)).toMatchObject({ enabled: false });
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled();
  });
  it('does not repeat a claim whose response is lost after commit', async () => {
    nodeMode();
    mocks.rpc.mockReturnValue({ abortSignal: () => Promise.reject(new DOMException('private detail', 'TimeoutError')) });
    expect(await processKycPrescreening(service as never)).toMatchObject({ stopReason: 'claim_unknown', writeErrors: 1 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.download).not.toHaveBeenCalled();
  });
  it('holds local admission before download and does not repeat unknown finish', async () => {
    nodeMode();
    let release: (value: unknown) => void = () => {};
    const claim = new Promise(resolve => { release = resolve; });
    mocks.rpc.mockReturnValueOnce({ abortSignal: () => claim }).mockReturnValue({ abortSignal: () => Promise.reject(new Error('lost finish')) });
    const first = processKycPrescreening(service as never);
    expect(await processKycPrescreening(service as never)).toMatchObject({ stopReason: 'busy', claimed: 0 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    release({ data: [job()], error: null });
    expect(await first).toMatchObject({ writeErrors: 1, acknowledged: 0 });
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const remove = vi.fn();
const createServiceClient = vi.fn();
const start = vi.fn();
const finish = vi.fn();
vi.mock('@/lib/kyc/security-monitor', () => ({ startKycPurgeRun: start, finishKycPurgeRun: finish }));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));

const { POST, GET } = await import('../route');

describe('POST /api/cron/purge-kyc-evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    start.mockResolvedValue('11111111-1111-4111-8111-111111111111');
    finish.mockResolvedValue(undefined);
    process.env.CRON_SECRET = 'cron-test-secret';
    createServiceClient.mockReturnValue({
      rpc,
      storage: { from: () => ({ remove }) },
    });
  });

  it('supports authenticated scheduler GET requests', async () => {
    rpc.mockImplementation((name:string)=>Promise.resolve(name==='purge_kyc_draft_ocr_operations'
      ?{data:[{marked_for_reconciliation:0,deleted:0}],error:null}:{data:[],error:null}));
    const response = await GET(new Request('http://localhost', { headers: { authorization: 'Bearer cron-test-secret' } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ claimed: 0, purged: 0, failed: 0 });
    expect(finish).toHaveBeenCalledWith(expect.anything(), expect.any(String), { claimed: 0, purged: 0, failed: 0, failureCode: null });
  });

  it('requires the configured cron secret', async () => {
    const response = await POST(new Request('http://localhost/api/cron/purge-kyc-evidence'));

    expect(response.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('deletes claimed private objects, confirms each successful deletion, and returns counts only', async () => {
    const submissionId = '00000000-0000-0000-0000-000000000001';
    const path = `private/${submissionId}/front/opaque.bin`;
    rpc.mockImplementation((name: string) => {
      if (name === 'purge_expired_kyc_evidence') {
        return Promise.resolve({ data: [{ submission_id: submissionId, side: 'front', storage_path: path }], error: null });
      }
      if (name === 'confirm_purged_kyc_evidence') return Promise.resolve({ data: true, error: null });
      if (name === 'purge_kyc_draft_ocr_operations') return Promise.resolve({data:[{marked_for_reconciliation:0,deleted:0}],error:null});
      throw new Error(`unexpected rpc ${name}`);
    });
    remove.mockResolvedValue({ data: [{ name: path }], error: null });

    const response = await POST(new Request('http://localhost/api/cron/purge-kyc-evidence', {
      headers: { authorization: 'Bearer cron-test-secret' },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ claimed: 1, purged: 1, failed: 0 });
    expect(typeof body.requestId).toBe('string');
    expect(JSON.stringify(body)).not.toContain(path);
    expect(remove).toHaveBeenCalledWith([path]);
    expect(rpc).toHaveBeenCalledWith('confirm_purged_kyc_evidence', {
      p_submission_id: submissionId,
      p_side: 'front',
    });
  });

  it('does not confirm metadata when object deletion fails', async () => {
    const submissionId = '00000000-0000-0000-0000-000000000002';
    rpc.mockImplementation((name:string)=>Promise.resolve(name==='purge_kyc_draft_ocr_operations'
      ?{data:[{marked_for_reconciliation:0,deleted:0}],error:null}
      :{data:[{ submission_id: submissionId, side: 'back', storage_path: 'private/opaque.bin' }],error:null}));
    remove.mockResolvedValue({ data: null, error: new Error('storage unavailable') });

    const response = await POST(new Request('http://localhost/api/cron/purge-kyc-evidence', {
      headers: { authorization: 'Bearer cron-test-secret' },
    }));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ claimed: 1, purged: 0, failed: 1 });
    expect(rpc).toHaveBeenCalledWith('purge_kyc_draft_ocr_operations',{p_limit:500});
    expect(finish).toHaveBeenCalledWith(expect.anything(), expect.any(String), { claimed: 1, purged: 0, failed: 1, failureCode: 'storage_failed' });
  });
  it('records claim failures and keeps raw errors private', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('private/identity.jpg') });
    const response = await POST(new Request('http://localhost', { headers: { authorization: 'Bearer cron-test-secret' } }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('identity.jpg');
    expect(finish).toHaveBeenCalledWith(expect.anything(), expect.any(String), { claimed: 0, purged: 0, failed: 0, failureCode: 'claim_failed' });
  });
  it('records unexpected thrown failures', async () => {
    rpc.mockRejectedValueOnce(new Error('private token'));
    const response = await POST(new Request('http://localhost', { headers: { authorization: 'Bearer cron-test-secret' } }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private token');
    expect(finish).toHaveBeenCalledWith(expect.anything(), expect.any(String), { claimed: 0, purged: 0, failed: 0, failureCode: 'unexpected_error' });
  });
  it('does not start deleting without durable run persistence', async () => {
    start.mockRejectedValueOnce(new Error('private details'));
    const response = await POST(new Request('http://localhost', { headers: { authorization: 'Bearer cron-test-secret' } }));
    expect(response.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('does not claim success when completion persistence fails', async () => {
    rpc.mockImplementation((name:string)=>Promise.resolve(name==='purge_kyc_draft_ocr_operations'
      ?{data:[{marked_for_reconciliation:0,deleted:0}],error:null}:{data:[],error:null}));
    finish.mockRejectedValueOnce(new Error('private details'));
    const response = await POST(new Request('http://localhost', { headers: { authorization: 'Bearer cron-test-secret' } }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private details');
  });
});

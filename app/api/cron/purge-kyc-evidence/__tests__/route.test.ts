import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const remove = vi.fn();
const createServiceClient = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));

const { POST } = await import('../route');

describe('POST /api/cron/purge-kyc-evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-test-secret';
    createServiceClient.mockReturnValue({
      rpc,
      storage: { from: () => ({ remove }) },
    });
  });

  it('requires the configured cron secret', async () => {
    const response = await POST(new Request('http://localhost/api/cron/purge-kyc-evidence'));

    expect(response.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('deletes claimed private objects, confirms each successful deletion, and returns counts only', async () => {
    const submissionId = '00000000-0000-0000-0000-000000000001';
    const path = `private/${submissionId}/front/opaque.bin`;
    rpc.mockImplementation((name: string) => {
      if (name === 'purge_expired_kyc_evidence') {
        return Promise.resolve({ data: [{ submission_id: submissionId, side: 'front', storage_path: path }], error: null });
      }
      if (name === 'confirm_purged_kyc_evidence') return Promise.resolve({ data: true, error: null });
      throw new Error(`unexpected rpc ${name}`);
    });
    remove.mockResolvedValue({ data: [{ name: path }], error: null });

    const response = await POST(new Request('http://localhost/api/cron/purge-kyc-evidence', {
      headers: { authorization: 'Bearer cron-test-secret' },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ claimed: 1, purged: 1, failed: 0 });
    expect(JSON.stringify(body)).not.toContain(path);
    expect(remove).toHaveBeenCalledWith([path]);
    expect(rpc).toHaveBeenCalledWith('confirm_purged_kyc_evidence', {
      p_submission_id: submissionId,
      p_side: 'front',
    });
  });

  it('does not confirm metadata when object deletion fails', async () => {
    const submissionId = '00000000-0000-0000-0000-000000000002';
    rpc.mockResolvedValue({
      data: [{ submission_id: submissionId, side: 'back', storage_path: 'private/opaque.bin' }],
      error: null,
    });
    remove.mockResolvedValue({ data: null, error: new Error('storage unavailable') });

    const response = await POST(new Request('http://localhost/api/cron/purge-kyc-evidence', {
      headers: { authorization: 'Bearer cron-test-secret' },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 1, purged: 0, failed: 1 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser }, rpc }) }));
const { POST } = await import('../route');

const submissionId = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const request = () => new Request('https://example.test/api/kyc/submission/withdraw', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ submissionId, expectedVersion: 5, operationId }),
});

describe('POST /api/kyc/submission/withdraw', () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: '33333333-3333-4333-8333-333333333333' } } });
    rpc.mockResolvedValue({ data: null, error: null });
  });

  it('uses the authenticated user JWT RPC and a stable operation ID', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('withdraw_kyc_submission', {
      p_submission_id: submissionId, p_expected_version: 5, p_operation_id: operationId,
    });
  });

  it('requires an authenticated owner before calling the RPC', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns conflict on a raced review without exposing database details', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'kyc_withdrawal_conflict: private row detail' } });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain('private row detail');
  });
});

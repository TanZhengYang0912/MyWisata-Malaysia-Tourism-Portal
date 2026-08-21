import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  authRpc: vi.fn(),
  serviceRpc: vi.fn(),
  from: vi.fn(),
  execute: vi.fn(),
  moderate: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.authRpc })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.from, rpc: mocks.serviceRpc })),
}));
vi.mock('@/lib/payouts/execute-approved-withdrawal', () => ({ executeApprovedWithdrawalPayout: mocks.execute }));
vi.mock('@/lib/payouts/tng-mock-callbacks', () => ({ scheduleTngMockCallbackAcceleration: mocks.schedule }));
vi.mock('@/lib/wallet/moderation-guard', () => ({ moderateWalletAction: mocks.moderate }));

import { POST } from '../route';

const withdrawalId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function request() {
  return new Request('http://localhost/api/admin/withdrawals/id/retry-payout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify({ note: 'Retry after provider availability was confirmed.', reasonCategory: 'payout_ready' }),
  });
}

describe('POST /api/admin/withdrawals/:id/retry-payout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: actorId } }, error: null });
    mocks.authRpc.mockResolvedValue({ data: true, error: null });
    mocks.moderate.mockResolvedValue({ ok: true, categories: [] });
    const single = vi.fn().mockResolvedValue({ data: { id: withdrawalId, user_id: userId, amount: 50, status: 'approved' }, error: null });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select });
    mocks.serviceRpc.mockResolvedValue({ data: { status: 'approved' }, error: null });
    mocks.execute.mockResolvedValue({
      ok: true,
      data: {
        status: 'processing',
        provider: 'tng_direct_credit',
        callbackJobId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        callbackAvailableAt: '2026-08-21T05:00:03.000Z',
      },
    });
  });

  it('requires approver access', async () => {
    mocks.authRpc.mockResolvedValue({ data: false, error: null });
    const response = await POST(request(), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('retries provider execution for an approved withdrawal without approving again', async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: withdrawalId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.authRpc).toHaveBeenCalledWith('is_approver', { uid: actorId });
    expect(mocks.authRpc).not.toHaveBeenCalledWith('approve_wallet_withdrawal', expect.anything());
    expect(mocks.serviceRpc).toHaveBeenCalledWith('record_withdrawal_payout_retry', expect.objectContaining({
      p_withdrawal_id: withdrawalId,
      p_actor_id: actorId,
      p_reason_category: 'payout_ready',
    }));
    expect(mocks.execute).toHaveBeenCalledWith({ withdrawalId, userId, amountRm: 50 });
    expect(mocks.schedule).toHaveBeenCalledWith(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '2026-08-21T05:00:03.000Z',
    );
    expect(body.data).not.toHaveProperty('callbackJobId');
    expect(body.data).not.toHaveProperty('callbackAvailableAt');
  });

  it('rejects retry when the request is not at the approved checkpoint', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: withdrawalId, user_id: userId, amount: 50, status: 'processing' }, error: null });
    mocks.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }) });

    const response = await POST(request(), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining('Refresh the page') },
    });
  });

  it('tells a self-reviewing approver who should handle the retry', async () => {
    mocks.serviceRpc.mockResolvedValue({ data: null, error: { message: 'self_dealing' } });
    const response = await POST(request(), { params: Promise.resolve({ id: withdrawalId }) });
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error.message).toContain('another Approver or Super Admin');
  });

  it('explains that a concurrent payout attempt must finish before retrying', async () => {
    mocks.serviceRpc.mockResolvedValue({ data: null, error: { message: 'payout_execution_in_progress' } });
    const response = await POST(request(), { params: Promise.resolve({ id: withdrawalId }) });
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({
      code: 'PAYOUT_EXECUTION_IN_PROGRESS',
      message: expect.stringContaining('Refresh the page'),
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

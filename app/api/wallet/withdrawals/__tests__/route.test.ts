import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  enqueueWithdrawalEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })),
}));
vi.mock('@/lib/email/events', () => ({ enqueueWithdrawalEmail: mocks.enqueueWithdrawalEmail }));

import { POST } from '../route';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/wallet/withdrawals', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/wallet/withdrawals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null });
  });

  it('submits only an integer-sen amount to the authenticated withdrawal RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { request_id: '22222222-2222-4222-8222-222222222222', requires_dual_approval: false }, error: null });

    const response = await POST(request({ amountRm: '50.25' }));

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('submit_wallet_withdrawal', { p_amount_sen: 5025 });
  });

  it('maps KYC enforcement to a customer-safe error', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'kyc_required' } });

    const response = await POST(request({ amountRm: '50.00' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'KYC_REQUIRED' } });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), moderateWalletAction: vi.fn(), enqueueWithdrawalEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })),
}));
vi.mock('@/lib/wallet/moderation-guard', () => ({ moderateWalletAction: mocks.moderateWalletAction }));
vi.mock('@/lib/email/events', () => ({ enqueueWithdrawalEmail: mocks.enqueueWithdrawalEmail }));

import { POST } from '../route';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/withdrawals/id/reject', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, body: JSON.stringify(body),
  });
}

describe('POST /api/admin/withdrawals/:id/reject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null });
    mocks.moderateWalletAction.mockResolvedValue({ ok: true, categories: [] });
    mocks.rpc.mockImplementation((name: string) => name === 'has_staff_permission'
      ? Promise.resolve({ data: true, error: null })
      : Promise.resolve({ data: null, error: null }));
  });

  it('requires a ten-character reason before moderation or release RPC', async () => {
    const response = await POST(request({ reason: 'short' }), { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) });

    expect(response.status).toBe(422);
    expect(mocks.moderateWalletAction).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith('reject_wallet_withdrawal', expect.anything());
  });

  it('sends the server-observed IP with a clean rejection reason', async () => {
    mocks.moderateWalletAction.mockResolvedValue({ ok: true, categories: [] });
    mocks.rpc.mockImplementation((name: string) => name === 'has_staff_permission'
      ? Promise.resolve({ data: true, error: null })
      : Promise.resolve({ data: { user_id: '33333333-3333-4333-8333-333333333333', amount_rm: 50 }, error: null }));

    const response = await POST(request({ reasonCategory: 'bank_details_mismatch', reason: 'The payout details could not be verified.' }), { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('reject_wallet_withdrawal', {
      p_id: '22222222-2222-4222-8222-222222222222',
      p_reason: 'The payout details could not be verified.',
      p_ip: '203.0.113.9',
      p_reason_category: 'bank_details_mismatch',
    });
  });
});

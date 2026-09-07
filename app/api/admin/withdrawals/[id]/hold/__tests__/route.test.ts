import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), moderateWalletAction: vi.fn(), enqueueWithdrawalEmail: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })) }));
vi.mock('@/lib/wallet/moderation-guard', () => ({ moderateWalletAction: mocks.moderateWalletAction }));
vi.mock('@/lib/email/events', () => ({ enqueueWithdrawalEmail: mocks.enqueueWithdrawalEmail }));

import { POST } from '../route';

describe('POST /api/admin/withdrawals/:id/hold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null });
    mocks.moderateWalletAction.mockResolvedValue({ ok: true, categories: [] });
    mocks.rpc.mockImplementation((name: string) => name === 'has_staff_permission'
      ? Promise.resolve({ data: true, error: null })
      : Promise.resolve({ data: null, error: null }));
  });

  it('does not call a mutation for a missing or short hold reason', async () => {
    const response = await POST(new Request('http://localhost/api/admin/withdrawals/id/hold', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reasonCategory: 'other', reason: 'short' }),
    }), { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) });

    expect(response.status).toBe(422);
    expect(mocks.moderateWalletAction).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith('hold_wallet_withdrawal', expect.anything());
  });
});

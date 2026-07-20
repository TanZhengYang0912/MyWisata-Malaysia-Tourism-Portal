import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), moderateWalletAction: vi.fn(), enqueueWithdrawalEmail: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })) }));
vi.mock('@/lib/wallet/moderation-guard', () => ({ moderateWalletAction: mocks.moderateWalletAction }));
vi.mock('@/lib/email/events', () => ({ enqueueWithdrawalEmail: mocks.enqueueWithdrawalEmail }));

import { POST } from '../route';

const id = '22222222-2222-4222-8222-222222222222';
const actor = '11111111-1111-4111-8111-111111111111';
function request(body: Record<string, unknown>) { return new Request(`http://localhost/api/admin/withdrawals/${id}/resume`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }

describe('POST /api/admin/withdrawals/:id/resume', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null }); mocks.moderateWalletAction.mockResolvedValue({ ok: true, categories: [] }); mocks.enqueueWithdrawalEmail.mockResolvedValue(undefined); });
  it('requires a category and a ten-character reason', async () => { const response = await POST(request({ reason: 'short' }), { params: Promise.resolve({ id }) }); expect(response.status).toBe(422); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it('resumes a held withdrawal and sends the fresh cycle to email', async () => {
    mocks.rpc.mockResolvedValue({ data: { user_id: actor, amount_rm: 100, approval_cycle: 2 }, error: null });
    const response = await POST(request({ reasonCategory: 'risk_review_cleared', reason: 'The additional risk review is complete.' }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('resume_wallet_withdrawal', expect.objectContaining({ p_reason_category: 'risk_review_cleared' }));
    expect(mocks.enqueueWithdrawalEmail).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'withdrawal_resumed', withdrawalId: `${id}:cycle:2` }));
  });
});

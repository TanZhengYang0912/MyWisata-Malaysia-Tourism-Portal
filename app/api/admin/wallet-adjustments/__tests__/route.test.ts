import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  moderateWalletAction: vi.fn(),
  enqueueUserTransactionEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })),
}));
vi.mock('@/lib/wallet/moderation-guard', () => ({ moderateWalletAction: mocks.moderateWalletAction }));
vi.mock('@/lib/email/events', () => ({ enqueueUserTransactionEmail: mocks.enqueueUserTransactionEmail }));

import { POST } from '../route';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/wallet-adjustments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/wallet-adjustments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null });
    mocks.moderateWalletAction.mockResolvedValue({ ok: true, categories: [] });
    mocks.enqueueUserTransactionEmail.mockResolvedValue(undefined);
  });

  it('rejects a short reason before moderation or a money mutation', async () => {
    const response = await POST(request({
      userId: '22222222-2222-4222-8222-222222222222',
      bucket: 'topup',
      direction: 'credit',
      amountSen: 5000,
      reason: 'short',
    }));

    expect(response.status).toBe(422);
    expect(mocks.moderateWalletAction).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('blocks flagged text before it calls the adjustment RPC', async () => {
    mocks.moderateWalletAction.mockResolvedValue({ ok: false, code: 'CONTENT_REJECTED', message: 'Reason rejected by Wallet policy: harassment' });

    const response = await POST(request({
      userId: '22222222-2222-4222-8222-222222222222',
      bucket: 'earnings',
      direction: 'debit',
      amountSen: 5000,
      reason: 'This contains abusive wording.',
    }));

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('passes a clean, validated adjustment to the server-side RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { transaction_id: '33333333-3333-4333-8333-333333333333' }, error: null });

    const response = await POST(request({
      userId: '22222222-2222-4222-8222-222222222222',
      bucket: 'topup',
      direction: 'credit',
      amountSen: 5000,
      reason: 'Refunded duplicate wallet top-up.',
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('apply_wallet_adjustment', {
      p_user_id: '22222222-2222-4222-8222-222222222222',
      p_bucket: 'topup',
      p_direction: 'credit',
      p_amount_sen: 5000,
      p_reason: 'Refunded duplicate wallet top-up.',
    });
  });
});

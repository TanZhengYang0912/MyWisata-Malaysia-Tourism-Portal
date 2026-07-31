import { beforeEach, describe, expect, it, vi } from 'vitest';

const limit = vi.fn();
const order = vi.fn(() => ({ limit }));
const eq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq }));

vi.mock('@/backend/supabase', () => ({
  supabase: {
    from: () => ({ select }),
  },
}));

const { getWalletTransactions } = await import('@/backend/domains/commerce');

describe('getWalletTransactions', () => {
  beforeEach(() => {
    select.mockClear();
    eq.mockClear();
    order.mockClear();
    limit.mockReset();
  });

  it('maps ledger sen amounts and returns newest transactions first', async () => {
    limit.mockResolvedValue({
      data: [{
        id: 'txn-1',
        user_id: 'user-1',
        wallet_id: 'wallet-1',
        order_id: 'order-1',
        withdrawal_id: null,
        type: 'earnings',
        amount_sen: 1250,
        bucket: 'earnings',
        direction: 'credit',
        note: 'Completed order commission',
        created_at: '2026-07-31T10:00:00.000Z',
      }],
      error: null,
    });

    await expect(getWalletTransactions('user-1', 25)).resolves.toEqual([{
      id: 'txn-1',
      userId: 'user-1',
      walletId: 'wallet-1',
      orderId: 'order-1',
      withdrawalId: null,
      type: 'earnings',
      amount: 12.5,
      bucket: 'earnings',
      direction: 'credit',
      note: 'Completed order commission',
      createdAt: '2026-07-31T10:00:00.000Z',
    }]);
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limit).toHaveBeenCalledWith(25);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.fn();

vi.mock('@/backend/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  },
}));

const { getWalletBuckets } = await import('@/backend/domains/commerce');

describe('getWalletBuckets', () => {
  beforeEach(() => maybeSingle.mockReset());

  it('returns the separately-held pending reward balance', async () => {
    maybeSingle.mockResolvedValue({ data: { topup_sen: 1234, earnings_sen: 5000, pending_earnings_sen: 2500 } });

    await expect(getWalletBuckets('user-1')).resolves.toEqual({ topup: 12.34, earnings: 50, pendingEarnings: 25 });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getRecommendationEarnings: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('@/lib/recommendations/earnings', () => ({
  getRecommendationEarnings: mocks.getRecommendationEarnings,
}));

import { GET } from '../route';

const userId = '11111111-1111-4111-8111-111111111111';

describe('GET /api/recommendations/earnings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401s when signed out', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.getRecommendationEarnings).not.toHaveBeenCalled();
  });

  it('returns the earnings payload for the signed-in user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } } });
    const payload = {
      totals: { pending: 12.5, lifetimeCleared: 18, convertedVendors: 2 },
      commissions: [{ id: 'c1' }],
    };
    mocks.getRecommendationEarnings.mockResolvedValue(payload);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: payload });
    expect(mocks.getRecommendationEarnings).toHaveBeenCalledWith(expect.anything(), userId);
  });
});

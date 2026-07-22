import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const isRecommendationRewardAdmin = vi.fn();
const clearMaturedRecommendationRewards = vi.fn();
const createServiceClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));
vi.mock('@/lib/recommendations/admin-guard', () => ({ isRecommendationRewardAdmin }));
vi.mock('@/lib/recommendations/reward-clearing', () => ({ clearMaturedRecommendationRewards }));

const { POST } = await import('../route');

describe('POST /api/admin/recommendations/run-clearing', () => {
  beforeEach(() => {
    getUser.mockReset();
    isRecommendationRewardAdmin.mockReset();
    clearMaturedRecommendationRewards.mockReset();
    createServiceClient.mockReset();
  });

  it('requires an authenticated admin before creating a service client', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST();

    expect(response.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('rejects a signed-in non-admin before creating a service client', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } });
    isRecommendationRewardAdmin.mockResolvedValue(false);

    const response = await POST();

    expect(response.status).toBe(403);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('runs aggregate reward clearing only for an admin or super admin', async () => {
    const service = { rpc: vi.fn() };
    getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } });
    isRecommendationRewardAdmin.mockResolvedValue(true);
    createServiceClient.mockReturnValue(service);
    clearMaturedRecommendationRewards.mockResolvedValue({ cleared: [], reversed: [], skipped: 2 });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { skipped: 2 } });
    expect(clearMaturedRecommendationRewards).toHaveBeenCalledWith(service);
  });
});

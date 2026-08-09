import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const isSuperAdmin = vi.fn();
const createServiceClient = vi.fn();
const reviewAdminConductFlag = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin }));
vi.mock('@/lib/moderation/admin-conduct', () => ({ reviewAdminConductFlag }));

const { PATCH } = await import('../route');

const FLAG_ID = '11111111-1111-4111-8111-111111111111';

function callRoute() {
  return PATCH(new Request(`http://localhost/api/admin/conduct-flags/${FLAG_ID}`, { method: 'PATCH' }), {
    params: Promise.resolve({ id: FLAG_ID }),
  });
}

describe('PATCH /api/admin/conduct-flags/[id]', () => {
  beforeEach(() => {
    getUser.mockReset();
    isSuperAdmin.mockReset();
    createServiceClient.mockReset();
    reviewAdminConductFlag.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'admin-2' } } });
    isSuperAdmin.mockResolvedValue(true);
    createServiceClient.mockReturnValue({});
    reviewAdminConductFlag.mockResolvedValue(true);
  });

  it('requires an authenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await callRoute();
    expect(response.status).toBe(401);
  });

  it('requires super_admin', async () => {
    isSuperAdmin.mockResolvedValue(false);
    const response = await callRoute();
    expect(response.status).toBe(403);
  });

  it('404s when nothing open matched', async () => {
    reviewAdminConductFlag.mockResolvedValue(false);
    const response = await callRoute();
    expect(response.status).toBe(404);
  });

  it('marks the flag reviewed as the calling admin', async () => {
    const response = await callRoute();
    expect(response.status).toBe(200);
    expect(reviewAdminConductFlag).toHaveBeenCalledWith(expect.anything(), FLAG_ID, 'admin-2');
    await expect(response.json()).resolves.toMatchObject({ data: { id: FLAG_ID, status: 'reviewed' } });
  });
});

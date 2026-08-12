import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const isSuperAdmin = vi.fn();
const getAdminConductFlags = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin }));
vi.mock('@/lib/moderation/admin-conduct', () => ({ getAdminConductFlags }));

const { GET } = await import('../route');

describe('GET /api/admin/conduct-flags', () => {
  beforeEach(() => {
    getUser.mockReset();
    isSuperAdmin.mockReset();
    getAdminConductFlags.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    isSuperAdmin.mockResolvedValue(true);
    getAdminConductFlags.mockResolvedValue([]);
  });

  it('requires an authenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('requires super_admin — approver alone is not enough', async () => {
    isSuperAdmin.mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it('returns the flag list for a super admin', async () => {
    getAdminConductFlags.mockResolvedValue([{ id: 'flag-1' }]);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: [{ id: 'flag-1' }] });
  });
});

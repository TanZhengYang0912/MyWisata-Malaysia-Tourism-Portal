import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })),
}));

import { GET } from '../unread-count/route';

const adminId = '11111111-1111-4111-8111-111111111111';

describe('GET /api/admin/recommendations/unread-count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: adminId } }, error: null });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'is_super_admin') return { data: true, error: null };
      return { data: 3, error: null };
    });
  });

  it('requires an authenticated session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires the signed-in user to be a Super Admin', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledWith('is_super_admin', { uid: adminId });
  });

  it('returns the caller-specific pending unread count for a Super Admin', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { count: 3 }, error: null });
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_unread_recommendation_count');
  });

  it('does not expose RPC error details', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'is_super_admin') return { data: true, error: null };
      return { data: null, error: { message: 'internal database detail' } };
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.message).toBe('Unable to load recommendation unread state');
    expect(JSON.stringify(body)).not.toContain('internal database detail');
  });
});

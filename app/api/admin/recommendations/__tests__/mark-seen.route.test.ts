import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })),
}));

import { POST } from '../mark-seen/route';

const adminId = '11111111-1111-4111-8111-111111111111';
const seenAt = '2026-08-07T00:00:00.000Z';

describe('POST /api/admin/recommendations/mark-seen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: adminId } }, error: null });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'is_super_admin') return { data: true, error: null };
      return { data: seenAt, error: null };
    });
  });

  it('requires an authenticated session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST();

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires the signed-in user to be a Super Admin', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const response = await POST();

    expect(response.status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledWith('is_super_admin', { uid: adminId });
  });

  it('records a Recommendations page view through the owner-safe RPC', async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { seenAt }, error: null });
    expect(mocks.rpc).toHaveBeenCalledWith('mark_my_recommendations_seen');
  });

  it('does not expose RPC error details', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'is_super_admin') return { data: true, error: null };
      return { data: null, error: { message: 'internal database detail' } };
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.message).toBe('Unable to update recommendation unread state');
    expect(JSON.stringify(body)).not.toContain('internal database detail');
  });
});

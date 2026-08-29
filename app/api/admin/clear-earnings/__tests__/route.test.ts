import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

import { POST } from '../route';

describe('POST /api/admin/clear-earnings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the database RPC that authorizes the actor and locks eligible subjects', async () => {
    mocks.rpc.mockResolvedValue({ data: 3, error: null });

    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_pending_earnings');
    await expect(response.json()).resolves.toEqual({ confirmed: 3 });
  });

  it('maps database actor authorization failures without clearing earnings', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'admin_required' } });

    const response = await POST();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'admin_required' });
  });
});

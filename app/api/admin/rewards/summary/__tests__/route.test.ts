import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn(), isSuperAdmin: vi.fn(), service: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.service }));

import { GET } from '../route';

describe('GET /api/admin/rewards/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.service.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: { count: 2, total_rm: '7.50' }, error: null });
  });

  it('returns a bounded RM aggregate using one cutoff argument', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const [, args] = mocks.rpc.mock.calls[0]!;
    const cutoff = (args as { p_cutoff: string }).p_cutoff;
    expect(typeof cutoff).toBe('string');
    expect(Number.isFinite(Date.parse(cutoff))).toBe(true);
    const body = await response.json();
    expect(body).toMatchObject({ data: { count: 2, totalRM: 7.5 } });
    expect(JSON.stringify(body)).not.toContain('userId');
  });

  it('does not expose a false zero when the aggregate fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('database detail') });
    const response = await GET();
    expect(response.status).toBe(500);
  });

  it('requires Super Admin access before calling the RPC', async () => {
    mocks.isSuperAdmin.mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

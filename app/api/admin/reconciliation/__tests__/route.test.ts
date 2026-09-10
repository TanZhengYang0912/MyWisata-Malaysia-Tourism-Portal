import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  getOrderMoneyReconciliation: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({})) }));
vi.mock('@/lib/admin/reconciliation', () => ({ getOrderMoneyReconciliation: mocks.getOrderMoneyReconciliation }));

import { GET } from '../route';

const req = (url = 'http://localhost/api/admin/reconciliation') => new Request(url);

describe('GET /api/admin/reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrderMoneyReconciliation.mockResolvedValue({ rows: [], totals: {} });
  });

  it('401s when signed out', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(req())).status).toBe(401);
  });

  it('403s a non-super-admin', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await GET(req())).status).toBe(403);
  });

  it('422s an invalid period', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect((await GET(req('http://localhost/api/admin/reconciliation?period=2026-13'))).status).toBe(422);
  });

  it('returns the report for a super admin, deriving a UTC month range', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const res = await GET(req('http://localhost/api/admin/reconciliation?period=2026-03'));
    expect(res.status).toBe(200);
    expect(mocks.getOrderMoneyReconciliation).toHaveBeenCalledWith(
      expect.anything(),
      { fromISO: '2026-03-01T00:00:00.000Z', toISO: '2026-04-01T00:00:00.000Z' },
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  serviceRpc: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  getOrderMoneyReconciliation: vi.fn(),
  getEventReservationOperations: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ rpc: mocks.serviceRpc })) }));
vi.mock('@/lib/admin/reconciliation', () => ({ getOrderMoneyReconciliation: mocks.getOrderMoneyReconciliation, getEventReservationOperations: mocks.getEventReservationOperations }));

import { GET, POST } from '../route';

const req = (url = 'http://localhost/api/admin/reconciliation') => new Request(url);

describe('GET /api/admin/reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEventReservationOperations.mockResolvedValue({ cases: [], summary: {}, jobs: [] });
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
    expect(mocks.getEventReservationOperations).not.toHaveBeenCalled();
  });

  it('binds mine to the authenticated actor and validates filters before reading', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect((await GET(req('http://localhost/api/admin/reconciliation?caseOwner=mine&casePage=2'))).status).toBe(200);
    expect(mocks.getEventReservationOperations).toHaveBeenCalledWith(expect.anything(), { actorId: 'admin', filters: expect.objectContaining({ caseOwner: 'mine', casePage: 2 }) });
    mocks.getEventReservationOperations.mockClear();
    for (const query of ['actor=other', 'casePage=0', 'caseOwner=some-uid', 'caseHandling=invalid']) {
      expect((await GET(req(`http://localhost/api/admin/reconciliation?${query}`))).status).toBe(422);
    }
    expect(mocks.getEventReservationOperations).not.toHaveBeenCalled();
  });

  it('422s an invalid period', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect((await GET(req('http://localhost/api/admin/reconciliation?period=2026-13'))).status).toBe(422);
  });

  it('returns the report for a super admin, deriving the Malaysia calendar month range', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const res = await GET(req('http://localhost/api/admin/reconciliation?period=2026-03&search=MW-4&status=paid&net=negative&page=2&pageSize=25'));
    expect(res.status).toBe(200);
    expect(mocks.getOrderMoneyReconciliation).toHaveBeenCalledWith(
      expect.anything(),
      { fromISO: '2026-02-28T16:00:00.000Z', toISO: '2026-03-31T16:00:00.000Z' },
      { filters: { search: 'MW-4', status: 'paid', net: 'negative' }, page: 2, pageSize: 25 },
    );
  });

  it('rejects invalid financial pagination and filters before database reads', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    for (const query of ['page=0', 'pageSize=100', 'net=unknown', 'search=' + 'x'.repeat(101)]) {
      expect((await GET(req(`http://localhost/api/admin/reconciliation?${query}`))).status).toBe(422);
    }
    expect(mocks.getOrderMoneyReconciliation).not.toHaveBeenCalled();
  });
});

it('refreshes overdue work only for Super Admin and never accepts a browser actor', async () => {
 const refresh = (body = { action: 'refresh_overdue' }) => new Request('http://localhost/api/admin/reconciliation', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 mocks.getUser.mockResolvedValue({data:{user:{id:'server-admin'}}});
 mocks.rpc.mockResolvedValue({data:false,error:null});
 expect((await POST(refresh())).status).toBe(403);
 expect(mocks.serviceRpc).not.toHaveBeenCalled();
 mocks.rpc.mockResolvedValue({data:true,error:null});
 expect((await POST(refresh({action:'refresh_overdue',actor:'fake'} as {action:string}))).status).toBe(422);
 mocks.serviceRpc.mockResolvedValue({data:{opened:1,closed:0},error:null});
 expect((await POST(refresh())).status).toBe(200);
 expect(mocks.serviceRpc).toHaveBeenCalledWith('refresh_overdue_event_pickups');
});

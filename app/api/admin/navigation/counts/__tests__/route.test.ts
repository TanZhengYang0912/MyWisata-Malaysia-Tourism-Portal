// These business-rule fixtures represent a session that has completed staff verification.
vi.mock("@/lib/auth/staff-assurance", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth/staff-assurance")>()), requireStaffAssurance: vi.fn(async () => null) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/auth/staff-assurance', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/auth/staff-assurance')>()), requireStaffAssurance: vi.fn(async () => null) }));

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getClaims: vi.fn(),
  roleFrom: vi.fn(),
  staffAccess: vi.fn(),
  from: vi.fn(),
  serviceRpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser, getClaims: mocks.getClaims }, from: mocks.roleFrom, rpc: mocks.staffAccess })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.from, rpc: mocks.serviceRpc })),
}));

import { GET } from '../route';

function mockRoles(...names: string[]) {
  const roleResult = { data: names.map((name) => ({ roles: { name } })), error: null };
  const scope = { is: vi.fn() };
  scope.is.mockImplementation(() => scope);
  const query = { is: vi.fn() };
  query.is.mockReturnValueOnce(scope);
  scope.is.mockResolvedValue(roleResult);
  mocks.roleFrom.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => query),
    })),
  });
}

function mockPermissions(...keys: string[]) {
  mocks.staffAccess.mockResolvedValue({ data: { permissionKeys: keys }, error: null });
}

function countQuery(count: number, error: { message: string } | null = null) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ count, error }).then(resolve, reject);
  return builder;
}

describe('GET /api/admin/navigation/counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-id' } }, error: null });
    mocks.getClaims.mockResolvedValue({ data: { claims: { aal: 'aal2' } }, error: null });
    mockRoles('super_admin');
    mockPermissions('admin.vendor.manage', 'admin.catalogue.review', 'admin.kyc.review', 'admin.withdrawal.approve', 'admin.recommendation.review');
    mocks.from.mockImplementation((table: string) => {
      const counts: Record<string, number> = {
        vendors: 2,
        outlets: 3,
        products: 4,
        vouchers: 1,
        kyc_submissions: 5,
        withdrawal_requests: 6,
        refunds: 7,
        chat_reports: 8,
        vendor_recommendations: 9,
      };
      return countQuery(counts[table] ?? 0);
    });
    mocks.serviceRpc.mockResolvedValue({ data: {
      count: 0, amount: 0, overdueCount: 0, dualApprovalCount: 0,
      oldestCreatedAt: null,
      activity: Array.from({ length: 7 }, (_, index) => ({ day: `2026-11-${String(index + 1).padStart(2, '0')}`, count: 0 })),
    }, error: null });
  });

  it('requires an authenticated admin', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(new Request('http://localhost/api/admin/navigation/counts'));

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns each actionable queue count', async () => {
    const response = await GET(new Request('http://localhost/api/admin/navigation/counts'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        vendors: 2,
        catalogue: 8,
        kyc: 5,
        withdrawals: 6,
        refunds: 7,
        chatReports: 8,
        recommendations: 9,
      },
      error: null,
    });
  });

  it('does not query or return withdrawal metadata to a content admin', async () => {
    mockRoles('admin');
    mockPermissions('admin.vendor.manage', 'admin.catalogue.review', 'admin.kyc.review', 'admin.recommendation.review');

    const response = await GET(new Request('http://localhost/api/admin/navigation/counts'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ kyc: 5, recommendations: 9 });
    expect(body.data).not.toHaveProperty('withdrawals');
    expect(mocks.from).not.toHaveBeenCalledWith('withdrawal_requests');
  });

  it('only queries and returns withdrawal metadata to an approver', async () => {
    mockRoles('approver');
    mockPermissions('admin.withdrawal.approve');

    const response = await GET(new Request('http://localhost/api/admin/navigation/counts'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ withdrawals: 6 });
    expect(mocks.from.mock.calls).toEqual([['withdrawal_requests']]);
  });

  it('preserves both queue groups for an account with admin and approver roles', async () => {
    mockRoles('admin', 'approver');
    const response = await GET(new Request('http://localhost/api/admin/navigation/counts'));
    const body = await response.json();
    expect(body.data).toEqual({ vendors: 2, catalogue: 8, kyc: 5, withdrawals: 6, refunds: 7, chatReports: 8, recommendations: 9 });
  });

  it('returns only wallet tasks for a custom Staff approver', async () => {
    mockRoles('staff');
    mockPermissions('admin.withdrawal.approve');

    const response = await GET(new Request('http://localhost/api/admin/navigation/counts'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { withdrawals: 6 } });
    expect(mocks.from.mock.calls).toEqual([['withdrawal_requests']]);
  });

  it('returns only recommendation tasks for a custom recommendation reviewer', async () => {
    mockRoles('staff');
    mockPermissions('admin.recommendation.review');

    const response = await GET(new Request('http://localhost/api/admin/navigation/counts'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { recommendations: 9 } });
    expect(mocks.from.mock.calls).toEqual([['vendor_recommendations']]);
  });

  it('returns only authorized queues for a Staff member with mixed permissions', async () => {
    mockRoles('staff');
    mockPermissions('admin.kyc.review', 'admin.withdrawal.approve');

    const response = await GET(new Request('http://localhost/api/admin/navigation/counts'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { kyc: 5, withdrawals: 6 } });
    expect(mocks.from.mock.calls).toEqual([['kyc_submissions'], ['withdrawal_requests']]);
  });

  it('does not query any queue after a custom Staff assignment is revoked', async () => {
    mockRoles('staff');
    mockPermissions();

    const response = await GET(new Request('http://localhost/api/admin/navigation/counts'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: {} });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not use an inactive Admin coarse role to read system queue counts', async () => {
    mockRoles('admin');
    mockPermissions();

    const response = await GET(new Request('http://localhost/api/admin/navigation/counts'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: {} });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('fails closed if effective permissions cannot be loaded', async () => {
    mockRoles('staff');
    mocks.staffAccess.mockResolvedValue({ data: null, error: new Error('unavailable') });
    const response = await GET(new Request('http://localhost/api/admin/navigation/counts'));
    expect(response.status).toBe(503);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not expose database error details', async () => {
    mocks.from.mockImplementation(() => countQuery(0, { message: 'internal database detail' }));

    const response = await GET(new Request('http://localhost/api/admin/navigation/counts'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(body.error.message).toBe('Unable to load admin queue counts');
    expect(JSON.stringify(body)).not.toContain('internal database detail');
  });

  it('returns a separate dashboard summary without changing the base count contract', async () => {
    const response = await GET(new Request('http://localhost/api/admin/navigation/counts?view=dashboard'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.summary.queues).toMatchObject({
      vendors: { availability: 'available', count: 2 },
      kyc: { availability: 'available', count: 5 },
      withdrawals: { availability: 'available', count: 0, amount: 0, activity: expect.any(Array) },
    });
    expect(body.data).toHaveProperty('vendors', 2);
    expect(mocks.serviceRpc).toHaveBeenCalledWith('get_admin_dashboard_withdrawal_summary', expect.any(Object));
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('treats null aggregates as unavailable instead of converting them to zero', async () => {
    mocks.serviceRpc.mockResolvedValue({ data: {
      count: null, amount: 0, overdueCount: 0, dualApprovalCount: 0, oldestCreatedAt: null,
      activity: Array.from({ length: 7 }, (_, index) => ({ day: `2026-11-${String(index + 1).padStart(2, '0')}`, count: 0 })),
    }, error: null });
    const response = await GET(new Request('http://localhost/api/admin/navigation/counts?view=dashboard'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.summary.queues.withdrawals).toMatchObject({ availability: 'unavailable', count: null, amount: null });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  roleFrom: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.roleFrom })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.from })),
}));

import { GET } from '../route';

function mockRoles(...names: string[]) {
  mocks.roleFrom.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(async () => ({ data: names.map((name) => ({ roles: { name } })), error: null })),
    })),
  });
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
    mockRoles('super_admin');
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
  });

  it('requires an authenticated admin', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns each actionable queue count', async () => {
    const response = await GET();

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

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ kyc: 5, recommendations: 9 });
    expect(body.data).not.toHaveProperty('withdrawals');
    expect(mocks.from).not.toHaveBeenCalledWith('withdrawal_requests');
  });

  it('only queries and returns withdrawal metadata to an approver', async () => {
    mockRoles('approver');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ withdrawals: 6 });
    expect(mocks.from.mock.calls).toEqual([['withdrawal_requests']]);
  });

  it('preserves both queue groups for an account with admin and approver roles', async () => {
    mockRoles('admin', 'approver');
    const response = await GET();
    const body = await response.json();
    expect(body.data).toEqual({ vendors: 2, catalogue: 8, kyc: 5, withdrawals: 6, refunds: 7, chatReports: 8, recommendations: 9 });
  });

  it('does not expose database error details', async () => {
    mocks.from.mockImplementation(() => countQuery(0, { message: 'internal database detail' }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.message).toBe('Unable to load admin queue counts');
    expect(JSON.stringify(body)).not.toContain('internal database detail');
  });
});

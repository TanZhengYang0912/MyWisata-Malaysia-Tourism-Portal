import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireStaffPermission: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/staff-permissions/server', () => ({ requireStaffPermission: mocks.requireStaffPermission }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));

import { GET } from '../route';

function resolvedBuilder(result: Record<string, unknown>) {
  const builder = {
    eq: vi.fn(),
    is: vi.fn(),
    not: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  builder.eq.mockReturnValue(builder);
  builder.is.mockReturnValue(builder);
  builder.not.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.range.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  return builder;
}

describe('GET /api/admin/vendors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffPermission.mockResolvedValue({ db: {}, user: { id: 'staff-1' }, response: null });

    mocks.createServiceClient.mockReturnValue({
      from: vi.fn((table: string) => ({
        select: vi.fn((_fields: string, options?: { head?: boolean }) => {
          if (table === 'vendor_recommendations') {
            return resolvedBuilder({ data: [{ id: 'rec-1', vendor_name: 'Recommended Cafe' }], error: null });
          }
          if (table !== 'vendors') throw new Error(`Unexpected table ${table}`);
          if (options?.head) return resolvedBuilder({ data: null, count: 1, error: null });
          return resolvedBuilder({
            data: [{ id: 'vendor-1', name: 'Cafe', users: { full_name: 'Owner', email: 'owner@example.com' } }],
            count: 1,
            error: null,
          });
        }),
      })),
    });
  });

  it('denies before constructing a service-role client', async () => {
    const forbidden = new Response(null, { status: 403 });
    mocks.requireStaffPermission.mockResolvedValue({ db: {}, user: null, response: forbidden });

    const response = await GET(new Request('http://localhost/api/admin/vendors'));

    expect(response.status).toBe(403);
    expect(mocks.requireStaffPermission).toHaveBeenCalledWith('admin.vendor.manage');
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('returns only the guarded vendor review projection and summary data', async () => {
    const response = await GET(new Request('http://localhost/api/admin/vendors?page=1&filter=all'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
      vendors: [{ id: 'vendor-1', name: 'Cafe' }],
      approvedRecommendations: [{ id: 'rec-1', vendor_name: 'Recommended Cafe' }],
      counts: { all: 1, pending: 1, approved: 1, welcomed: 1, rejected: 1, suspended: 1 },
    });
  });

  it('rejects invalid filters before constructing a service-role client', async () => {
    const response = await GET(new Request('http://localhost/api/admin/vendors?filter=unknown'));

    expect(response.status).toBe(422);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });
});

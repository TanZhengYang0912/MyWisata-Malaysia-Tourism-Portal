import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ require: vi.fn(), from: vi.fn(), tables: {} as Record<string, Record<string, ReturnType<typeof vi.fn>>> }));

function builder(result: unknown) {
  const terminal = Promise.resolve(result);
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'range', 'limit', 'ilike']) query[method] = vi.fn(() => query);
  query.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return query;
}

vi.mock('@/lib/staff-permissions/server', () => ({ requireStaffPermission: mocks.require }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from }) }));

import { GET } from '../route';

function request(query = '') {
  return new Request(`http://localhost/api/admin/orders${query}`);
}

describe('GET /api/admin/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.require.mockResolvedValue({ response: null });
    mocks.tables = {
      orders: builder({ data: [{ id: '11111111-1111-4111-8111-111111111111', user_id: '22222222-2222-4222-8222-222222222222', status: 'paid', created_at: '2026-09-25T00:00:00Z' }], count: 1, error: null }),
      users: builder({ data: [{ id: '22222222-2222-4222-8222-222222222222', full_name: 'Customer One', email: 'customer@example.test' }], error: null }),
      order_items: builder({ data: [{ id: '33333333-3333-4333-8333-333333333333', order_id: '11111111-1111-4111-8111-111111111111', product_name: 'Laksa', quantity: 1, line_total: 15, vendor_id: 'vendor-1', outlet_id: 'outlet-1', fulfil_status: 'pending', vendors: { name: 'Vendor A' }, outlets: { name: 'Outlet A' } }], error: null }),
      payments: builder({ data: [{ order_id: '11111111-1111-4111-8111-111111111111', method: 'stripe_card', provider: 'stripe', status: 'succeeded', amount: 15, created_at: '2026-09-25T00:00:01Z' }], error: null }),
    };
    mocks.from.mockImplementation((table: string) => mocks.tables[table]);
  });

  it('does no privileged query before requiring the dedicated read permission', async () => {
    mocks.require.mockResolvedValue({ response: new Response('forbidden', { status: 403 }) });
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(mocks.require).toHaveBeenCalledWith('admin.orders.read');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns bounded live order, customer, payment, vendor and outlet projections', async () => {
    const response = await GET(request('?page=1&status=paid'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      page: 1, pageSize: 25, total: 1,
      orders: [{
        id: '11111111-1111-4111-8111-111111111111',
        customer: { name: 'Customer One', email: 'customer@example.test' },
        items: [{ productName: 'Laksa', vendorName: 'Vendor A', outletName: 'Outlet A' }],
        payment: { method: 'stripe_card', status: 'succeeded' },
      }],
    });
    expect(mocks.tables.orders.eq).toHaveBeenCalledWith('status', 'paid');
    expect(mocks.tables.orders.range).toHaveBeenCalledWith(0, 24);
  });

  it('rejects invalid filters and pagination values', async () => {
    expect((await GET(request('?status=arbitrary'))).status).toBe(422);
    expect((await GET(request('?page=0'))).status).toBe(422);
    expect((await GET(request('?page=1001'))).status).toBe(422);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns a service-unavailable response when a related live projection fails', async () => {
    mocks.tables.order_items = builder({ data: null, error: { message: 'db detail' } });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('db detail');
  });
});

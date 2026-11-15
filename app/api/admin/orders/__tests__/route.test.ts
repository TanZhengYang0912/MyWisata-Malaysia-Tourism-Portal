import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ require: vi.fn(), from: vi.fn(), rpc: vi.fn(), tables: {} as Record<string, Record<string, ReturnType<typeof vi.fn>>> }));

function builder(result: unknown) {
  const terminal = Promise.resolve(result);
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'range', 'limit', 'ilike', 'or']) query[method] = vi.fn(() => query);
  query.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return query;
}

vi.mock('@/lib/staff-permissions/server', () => ({ requireStaffPermission: mocks.require }));
vi.mock('@/lib/entitlements/admin-guard', () => ({ requireAccessControlSuperAdmin: vi.fn(async () => ({ response: new Response('forbidden', { status: 403 }) })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));

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
    };
    mocks.from.mockImplementation((table: string) => mocks.tables[table]);
    mocks.rpc.mockResolvedValue({ data: { '11111111-1111-4111-8111-111111111111': {
      items: [{ id: '33333333-3333-4333-8333-333333333333', productName: 'Laksa', quantity: 1, lineTotal: 15, fulfilStatus: 'pending', vendorName: 'Vendor A', outletName: 'Outlet A' }],
      itemCount: 1, latestPayment: { id: 'payment-1', method: 'stripe_card', provider: 'stripe', status: 'succeeded', amount: 15, created_at: '2026-09-25T00:00:01Z' }, paymentCount: 1,
    } }, error: null });
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
    expect(body.data.orders[0]).toMatchObject({ itemCount: 1, itemsHasMore: false, paymentCount: 1, paymentsHasMore: false });
    expect(mocks.rpc).toHaveBeenCalledWith('admin_order_list_association_summaries', { p_order_ids: ['11111111-1111-4111-8111-111111111111'] });
  });

  it('filters parent orders by vendor before applying the existing page range', async () => {
    const vendorId = '44444444-4444-4444-8444-444444444444';
    mocks.tables.orders = builder({
      data: [{
        id: '11111111-1111-4111-8111-111111111111', user_id: '22222222-2222-4222-8222-222222222222',
        status: 'paid', created_at: '2026-09-25T00:00:00Z',
        order_items: [{ vendor_id: vendorId }, { vendor_id: vendorId }],
      }],
      count: 27,
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: { '11111111-1111-4111-8111-111111111111': {
      items: [
        { id: '33333333-3333-4333-8333-333333333333', productName: 'Laksa', vendorId, vendorName: 'Vendor A' },
        { id: '55555555-5555-4555-8555-555555555555', productName: 'Tea', vendorId: '66666666-6666-4666-8666-666666666666', vendorName: 'Vendor B' },
      ],
      itemCount: 2, latestPayment: null, paymentCount: 0,
    } }, error: null });
    const response = await GET(request(`?vendorId=${vendorId}&status=paid&page=2`));

    expect(response.status).toBe(200);
    expect(mocks.tables.orders.select).toHaveBeenCalledWith(
      expect.stringContaining('order_items!inner(vendor_id)'),
      { count: 'exact' },
    );
    expect(mocks.tables.orders.eq).toHaveBeenCalledWith('order_items.vendor_id', vendorId);
    expect(mocks.tables.orders.eq).toHaveBeenCalledWith('status', 'paid');
    expect(mocks.tables.orders.range).toHaveBeenCalledWith(25, 49);
    expect(mocks.rpc).toHaveBeenCalledWith('admin_order_list_association_summaries', { p_order_ids: ['11111111-1111-4111-8111-111111111111'] });
    const body = await response.json();
    expect(body.data.total).toBe(27);
    expect(body.data.orders).toHaveLength(1);
    expect(body.data.orders[0].items).toHaveLength(2);
    expect(body.data.orders[0]).not.toHaveProperty('order_items');
  });

  it('loads a Guest-only order page from contact snapshots without querying account users', async () => {
    mocks.tables.orders = builder({ data: [{ id: '11111111-1111-4111-8111-111111111111', display_id: 'ORD-GUEST', user_id: null, contact_name: 'Guest Buyer', contact_email: 'guest@example.test', status: 'paid' }], count: 1, error: null });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).data.orders[0].customer).toEqual({ name: 'Guest Buyer', email: 'guest@example.test' });
    expect(mocks.from).not.toHaveBeenCalledWith('users');
  });

  it('accepts display IDs with or without a hash and returns the latest payment preview', async () => {
    const response = await GET(request('?search=%23ORD-2026-0042'));
    expect(response.status).toBe(200);
    expect(mocks.tables.orders.eq).toHaveBeenCalledWith('display_id', 'ORD-2026-0042');
    const payload = await response.json();
    expect(payload.data.orders[0].payments).toHaveLength(1);
  });

  it('rejects invalid filters and pagination values', async () => {
    expect((await GET(request('?status=arbitrary'))).status).toBe(422);
    expect((await GET(request('?page=0'))).status).toBe(422);
    expect((await GET(request('?page=1001'))).status).toBe(422);
    expect((await GET(request('?vendorId=not-a-uuid'))).status).toBe(422);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns a service-unavailable response when a related live projection fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'db detail' } });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('db detail');
  });
});

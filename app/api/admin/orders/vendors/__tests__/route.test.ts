import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ require: vi.fn(), from: vi.fn(), vendorQuery: {} as Record<string, ReturnType<typeof vi.fn>> }));

function builder(result: unknown) {
  const terminal = Promise.resolve(result);
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'ilike', 'order', 'limit']) query[method] = vi.fn(() => query);
  query.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  mocks.vendorQuery = query;
  return query;
}

vi.mock('@/lib/staff-permissions/server', () => ({ requireStaffPermission: mocks.require }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from }) }));

import { GET } from '../route';

function request(query = '') {
  return new Request(`http://localhost/api/admin/orders/vendors${query}`);
}

describe('GET /api/admin/orders/vendors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.require.mockResolvedValue({ response: null });
    mocks.from.mockImplementation(() => builder({
      data: [{ id: '44444444-4444-4444-8444-444444444444', name: 'Vendor One' }],
      error: null,
    }));
  });

  it('requires order-read permission before querying vendors', async () => {
    mocks.require.mockResolvedValue({ response: new Response('forbidden', { status: 403 }) });

    const response = await GET(request('?search=Vendor'));

    expect(response.status).toBe(403);
    expect(mocks.require).toHaveBeenCalledWith('admin.orders.read');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns no results without reading vendors when the search is shorter than two characters', async () => {
    const response = await GET(request('?search=%20a%20'));

    expect(response.status).toBe(200);
    expect((await response.json()).data.vendors).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns only bounded vendor identity fields from a sanitized name search', async () => {
    const response = await GET(request('?search=Vendor'));

    expect(response.status).toBe(200);
    expect((await response.json()).data.vendors).toEqual([{ id: '44444444-4444-4444-8444-444444444444', name: 'Vendor One' }]);
    expect(mocks.from).toHaveBeenCalledWith('vendors');
    expect(mocks.vendorQuery.select).toHaveBeenCalledWith('id,name');
    expect(mocks.vendorQuery.ilike).toHaveBeenCalledWith('name', '%Vendor%');
    expect(mocks.vendorQuery.order).toHaveBeenNthCalledWith(1, 'name', { ascending: true });
    expect(mocks.vendorQuery.order).toHaveBeenNthCalledWith(2, 'id', { ascending: true });
    expect(mocks.vendorQuery.limit).toHaveBeenCalledWith(25);
  });

  it('rejects oversized search input before querying vendors', async () => {
    const response = await GET(request(`?search=${'x'.repeat(101)}`));

    expect(response.status).toBe(422);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns a generic unavailable response without exposing database details', async () => {
    mocks.from.mockImplementation(() => builder({ data: null, error: { message: 'sensitive db detail' } }));

    const response = await GET(request('?search=Vendor'));

    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('sensitive db detail');
  });
});

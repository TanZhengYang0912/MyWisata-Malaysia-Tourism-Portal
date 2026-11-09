import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  require: vi.fn(),
  read: vi.fn(),
  createService: vi.fn(),
}));

vi.mock('@/lib/staff-permissions/server', () => ({ requireStaffPermission: mocks.require }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createService }));
vi.mock('@/lib/admin/order-operations', () => ({ readAdminOrderDetail: mocks.read }));

import { GET } from '../route';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function request(path = '') {
  return new Request(`http://localhost/api/admin/orders/${ORDER_ID}${path}`);
}

describe('GET /api/admin/orders/:orderId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.require.mockResolvedValue({ response: null });
    mocks.createService.mockReturnValue({});
    mocks.read.mockResolvedValue({ status: 'ok', data: { order: { id: ORDER_ID }, items: [] } });
  });

  it('checks the dedicated permission before creating a privileged client', async () => {
    mocks.require.mockResolvedValue({ response: new Response('forbidden', { status: 403 }) });
    const response = await GET(request(), { params: Promise.resolve({ orderId: ORDER_ID }) });
    expect(response.status).toBe(403);
    expect(mocks.require).toHaveBeenCalledWith('admin.orders.read');
    expect(mocks.createService).not.toHaveBeenCalled();
  });

  it('rejects malformed IDs and query parameters before database access', async () => {
    const badId = await GET(request(), { params: Promise.resolve({ orderId: 'not-an-id' }) });
    const badQuery = await GET(request('?section=private'), { params: Promise.resolve({ orderId: ORDER_ID }) });
    expect(badId.status).toBe(422);
    expect(badQuery.status).toBe(422);
    expect(mocks.createService).not.toHaveBeenCalled();
  });

  it('returns the safe detail payload with private no-store caching', async () => {
    const response = await GET(request(), { params: Promise.resolve({ orderId: ORDER_ID }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ data: { order: { id: ORDER_ID } }, error: null });
    expect(mocks.read).toHaveBeenCalledWith({}, ORDER_ID, 'summary', null);
  });

  it('keeps not-found, invalid-cursor, and database failure outcomes distinct', async () => {
    mocks.read.mockResolvedValueOnce({ status: 'not_found' });
    expect((await GET(request(), { params: Promise.resolve({ orderId: ORDER_ID }) })).status).toBe(404);
    mocks.read.mockResolvedValueOnce({ status: 'invalid_cursor' });
    expect((await GET(request('?section=timeline&cursor=bad'), { params: Promise.resolve({ orderId: ORDER_ID }) })).status).toBe(422);
    mocks.read.mockResolvedValueOnce({ status: 'unavailable' });
    expect((await GET(request(), { params: Promise.resolve({ orderId: ORDER_ID }) })).status).toBe(503);
  });
});

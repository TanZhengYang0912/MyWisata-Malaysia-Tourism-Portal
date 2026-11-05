import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
vi.mock('@/backend/domains/commerce', () => ({ mapOrder: (row: unknown) => row }));
import { GET } from '../route';
beforeEach(() => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  mocks.rpc.mockResolvedValue({ data: { orders: [], total: 0, page: 1, pageSize: 10, stats: { total: 0, paid: 0, bookings: 0 }, outlets: [] }, error: null });
  mocks.rpc.mockClear();
});
describe('owned order pages', () => {
  it('authenticates and rejects attempts to choose another owner', async () => {
    expect((await GET(new Request('https://example.test/api/customer/orders?userId=other'))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await GET(new Request('https://example.test/api/customer/orders'))).status).toBe(401);
  });
  it('passes MYT date boundaries and database filters, without an owner parameter', async () => {
    const response = await GET(new Request('https://example.test/api/customer/orders?page=2&status=PAID&type=mixed&from=2026-10-01&to=2026-10-02'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.rpc).toHaveBeenCalledWith('list_my_orders', {
      p_page: 2, p_query: '', p_status: 'paid', p_kind: 'mixed', p_outlet_id: null,
      p_from: '2026-09-30T16:00:00.000Z', p_to: '2026-10-02T15:59:59.999Z',
    });
  });
  it('keeps database and thrown diagnostic details out of responses', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private relation / secret', code: 'XX000' } });
    const response = await GET(new Request('https://example.test/api/customer/orders'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private relation');
    mocks.rpc.mockRejectedValueOnce(new Error('internal path'));
    expect((await GET(new Request('https://example.test/api/customer/orders'))).status).toBe(503);
  });
});

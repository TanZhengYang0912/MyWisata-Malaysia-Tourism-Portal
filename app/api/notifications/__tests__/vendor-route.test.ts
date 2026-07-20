import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  authorizeVendor: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })),
}));

vi.mock('@/lib/vendor-authorization', () => ({
  authorizeVendor: mocks.authorizeVendor,
}));

import { GET } from '../route';
import { POST as markAll } from '../read-all/route';

const ownerId = '11111111-1111-4111-8111-111111111111';
const vendorId = '22222222-2222-4222-8222-222222222222';
const outletOne = '33333333-3333-4333-8333-333333333333';

function request(query = '') {
  return new Request(`http://localhost/api/notifications${query}`);
}

function queryFor(rows: unknown[] = []) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: rows, count: rows.length, error: null }),
  };
  return query;
}

function access(role: 'vendor_owner' | 'outlet_manager' = 'vendor_owner') {
  return {
    ok: true,
    access: {
      userId: ownerId,
      vendorId,
      role,
      outletIds: role === 'outlet_manager' ? [outletOne] : [outletOne],
      isOwner: role === 'vendor_owner',
      isOutletManager: role === 'outlet_manager',
      authDb: {},
      serviceDb: { from: mocks.from },
    },
  };
}

describe('GET /api/notifications vendor scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: ownerId } }, error: null });
    mocks.authorizeVendor.mockResolvedValue(access());
    mocks.from.mockReturnValue(queryFor());
  });

  it('requires authentication before vendor scope authorization', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.authorizeVendor.mockResolvedValue({ ok: false, response: Response.json({ error: 'should not run' }, { status: 401 }) });
    expect((await GET(request(`?scope=vendor&vendorId=${vendorId}`))).status).toBe(401);
    expect(mocks.authorizeVendor).not.toHaveBeenCalled();
  });

  it('rejects a vendor scope without a valid vendor id', async () => {
    const response = await GET(request('?scope=vendor'));
    expect(response.status).toBe(400);
    expect(mocks.authorizeVendor).not.toHaveBeenCalled();
  });

  it('authorizes the vendor and scopes the owner feed to that vendor', async () => {
    const query = queryFor([{ id: 'n1', type: 'vendor_order', title: 'Order', body: 'New order', link: null, category: 'vendor_orders', metadata: {}, read_at: null, created_at: '2026-07-20T00:00:00.000Z' }]);
    mocks.from.mockReturnValue(query);
    const response = await GET(request(`?scope=vendor&vendorId=${vendorId}&pageSize=100`));
    expect(response.status).toBe(200);
    expect(mocks.authorizeVendor).toHaveBeenCalledWith(vendorId);
    expect(query.eq).toHaveBeenCalledWith('user_id', ownerId);
    expect(query.eq).toHaveBeenCalledWith('vendor_id', vendorId);
    expect(query.range).toHaveBeenCalledWith(0, 49);
  });

  it('limits outlet managers to assigned outlets and hides wallet/account categories', async () => {
    mocks.authorizeVendor.mockResolvedValue(access('outlet_manager'));
    const query = queryFor();
    mocks.from.mockReturnValue(query);
    const response = await GET(request(`?scope=vendor&vendorId=${vendorId}&category=vendor_wallet`));
    expect(response.status).toBe(200);
    expect(query.in).toHaveBeenCalledWith('outlet_id', [outletOne]);
    expect(query.eq).toHaveBeenCalledWith('audience_role', 'outlet_manager');
    expect(query.not).toHaveBeenCalledWith('category', 'in', '(vendor_wallet,vendor_account)');
  });

  it('scopes vendor mark-all to the authorized vendor and outlet role', async () => {
    mocks.authorizeVendor.mockResolvedValue(access('outlet_manager'));
    const query = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      then: vi.fn(),
    };
    query.then.mockImplementation((resolve: (value: { error: null }) => void) => resolve({ error: null }));
    mocks.from.mockReturnValue(query);
    const response = await markAll(request(`?scope=vendor&vendorId=${vendorId}`));
    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith('vendor_id', vendorId);
    expect(query.in).toHaveBeenCalledWith('outlet_id', [outletOne]);
    expect(query.eq).toHaveBeenCalledWith('audience_role', 'outlet_manager');
  });

  it('rejects an unknown category instead of broadening the query', async () => {
    const response = await GET(request(`?scope=vendor&vendorId=${vendorId}&category=unknown`));
    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

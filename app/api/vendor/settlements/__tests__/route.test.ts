import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  resolveVendorForUser: vi.fn(),
  getVendorSettlements: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({})) }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/affiliate/vendor-share-stats', () => ({ resolveVendorForUser: mocks.resolveVendorForUser }));
vi.mock('@/lib/vendor/settlement', () => ({ getVendorSettlements: mocks.getVendorSettlements }));

import { GET } from '../route';

const req = (url = 'http://localhost/api/vendor/settlements') => new Request(url);

describe('GET /api/vendor/settlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVendorSettlements.mockResolvedValue({ totals: { pendingSen: 0, clearedSen: 0, lifetimePlatformFeesSen: 0 }, settlements: [] });
  });

  it('401s when signed out', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(req())).status).toBe(401);
  });

  it('403s when the caller is not a vendor owner', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mocks.isSuperAdmin.mockResolvedValue(false);
    mocks.resolveVendorForUser.mockResolvedValue({ vendorId: 'v1', role: 'outlet_manager' });
    expect((await GET(req())).status).toBe(403);
  });

  it("blocks probing another vendor's id", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mocks.isSuperAdmin.mockResolvedValue(false);
    mocks.resolveVendorForUser.mockResolvedValue({ vendorId: 'v1', role: 'vendor_owner' });
    expect((await GET(req('http://localhost/api/vendor/settlements?vendorId=v2'))).status).toBe(403);
  });

  it('returns the settlements for the caller vendor', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mocks.isSuperAdmin.mockResolvedValue(false);
    mocks.resolveVendorForUser.mockResolvedValue({ vendorId: 'v1', role: 'vendor_owner' });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mocks.getVendorSettlements).toHaveBeenCalledWith(expect.anything(), 'v1');
  });

  it('lets a super admin view any vendor via ?vendorId=', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
    mocks.isSuperAdmin.mockResolvedValue(true);
    await GET(req('http://localhost/api/vendor/settlements?vendorId=v9'));
    expect(mocks.getVendorSettlements).toHaveBeenCalledWith(expect.anything(), 'v9');
    expect(mocks.resolveVendorForUser).not.toHaveBeenCalled();
  });
});

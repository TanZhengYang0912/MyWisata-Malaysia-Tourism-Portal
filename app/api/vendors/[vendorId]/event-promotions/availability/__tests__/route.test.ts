import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), rpc: vi.fn(), getCost: vi.fn() }));
vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));
vi.mock('@/lib/admin/event-promotions', () => ({ getEventPromotionCostPerDaySen: mocks.getCost }));

import { GET } from '../route';

const vendorId = 'vendor-1';
function params() { return { params: Promise.resolve({ vendorId }) }; }
function request(query: string) {
  return new Request(`http://localhost/api/vendors/vendor-1/event-promotions/availability${query}`);
}

describe('/api/vendors/[vendorId]/event-promotions/availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCost.mockResolvedValue(12_500);
    mocks.rpc.mockResolvedValue({
      data: [
        { day: '2027-01-15', occupied_count: 4, available: false },
        { day: '2027-01-16', occupied_count: 1, available: true },
      ],
      error: null,
    });
    mocks.authorizeVendor.mockResolvedValue({
      ok: true,
      access: { userId: 'user-1', vendorId, authDb: { rpc: mocks.rpc }, serviceDb: {} },
    });
  });

  it('returns availability mapped from the RPC for a valid range', async () => {
    const response = await GET(request('?from=2027-01-15&to=2027-01-16'), params());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('get_event_promotion_date_availability', {
      p_from: '2027-01-15',
      p_to: '2027-01-16',
    });
    expect(body.data.availability).toEqual([
      { day: '2027-01-15', occupiedCount: 4, available: false },
      { day: '2027-01-16', occupiedCount: 1, available: true },
    ]);
    expect(body.data.costPerDaySen).toBe(12_500);
  });

  it('rejects a malformed date', async () => {
    const response = await GET(request('?from=not-a-date&to=2027-01-16'), params());
    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects to before from', async () => {
    const response = await GET(request('?from=2027-01-16&to=2027-01-15'), params());
    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects a range longer than 180 days', async () => {
    const response = await GET(request('?from=2027-01-01&to=2027-08-01'), params());
    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('propagates an authorization failure', async () => {
    mocks.authorizeVendor.mockResolvedValue({ ok: false, response: Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }) });
    const response = await GET(request('?from=2027-01-15&to=2027-01-16'), params());
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

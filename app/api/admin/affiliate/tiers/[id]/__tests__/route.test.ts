import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));

const { PATCH } = await import('../route');

const TIER_ID = 't2';

function request(body: unknown) {
  return new Request(`http://localhost/api/admin/affiliate/tiers/${TIER_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function callRoute(body: unknown) {
  return PATCH(request(body), { params: Promise.resolve({ id: TIER_ID }) });
}

function mockUpdateReturns(row: Record<string, unknown> | null, error: { message: string } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error });
  mocks.createServiceClient.mockReturnValue({
    from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle }) }) }) }) }),
  });
  return maybeSingle;
}

describe('PATCH /api/admin/affiliate/tiers/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(true);
  });

  it('requires super admin', async () => {
    mocks.isSuperAdmin.mockResolvedValue(false);
    const res = await callRoute({ activePeriodDays: 30 });
    expect(res.status).toBe(403);
  });

  it('rejects an empty body', async () => {
    const res = await callRoute({});
    expect(res.status).toBe(422);
  });

  it('rejects a fraud rate outside 0-100', async () => {
    const res = await callRoute({ maxFraudRatePercent: 150 });
    expect(res.status).toBe(422);
  });

  it('accepts explicit null to clear a threshold', async () => {
    mockUpdateReturns({ id: TIER_ID, tier_name: 'active', ongoing_rate: 0.04, min_conversions: 4, min_sales_amount_sen: 50000, active_period_days: null, max_fraud_rate_percent: null });
    const res = await callRoute({ activePeriodDays: null, maxFraudRatePercent: null });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ data: { activePeriodDays: null, maxFraudRatePercent: null } });
  });

  it('converts minSalesAmountRM to sen before storage', async () => {
    const maybeSingle = mockUpdateReturns({ id: TIER_ID, tier_name: 'active', ongoing_rate: 0.04, min_conversions: 4, min_sales_amount_sen: 75000, active_period_days: 90, max_fraud_rate_percent: 20 });
    const res = await callRoute({ minSalesAmountRM: 750 });
    expect(res.status).toBe(200);
    expect(maybeSingle).toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ data: { minSalesAmountSen: 75000 } });
  });
});

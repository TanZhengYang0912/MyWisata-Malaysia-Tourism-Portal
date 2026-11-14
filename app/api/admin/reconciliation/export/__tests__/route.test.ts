import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), role: vi.fn(), getReport: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.role })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({})) }));
vi.mock('@/lib/admin/reconciliation', () => ({ getOrderMoneyReconciliation: mocks.getReport }));

import { GET } from '../route';

const request = (query = '') => new Request(`http://localhost/api/admin/reconciliation/export${query ? `?${query}` : ''}`);
const report = (total: number) => ({
  rows: [{ orderId: 'order-id', orderDisplayId: 'MW-1', status: 'paid', paidAt: null,
    grossSen: 100, platformFeeSen: 10, vendorNetSen: 90, affiliatePayoutSen: 0,
    recommendationPayoutSen: 0, platformNetSen: 10, platformNetNegative: false }],
  total, statusOptions: ['paid'], page: 1, pageSize: 10001,
  totals: { grossSen: 100, platformFeeSen: 10, vendorNetSen: 90, affiliatePayoutSen: 0, recommendationPayoutSen: 0, platformNetSen: 10, negativeOrders: 0 },
});

describe('GET /api/admin/reconciliation/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
    mocks.role.mockResolvedValue({ data: true, error: null });
    mocks.getReport.mockResolvedValue(report(1));
  });

  it('rechecks Super Admin and returns a complete CSV projection', async () => {
    const response = await GET(request('period=2026-03&search=MW-1&net=positive'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(await response.text()).toContain('MW-1');
    expect(mocks.getReport).toHaveBeenCalledWith(expect.anything(), {
      fromISO: '2026-02-28T16:00:00.000Z', toISO: '2026-03-31T16:00:00.000Z',
    }, { filters: { search: 'MW-1', status: 'all', net: 'positive' }, page: 1, pageSize: 10001 });
  });

  it('returns 422 JSON before any CSV for more than 10000 matching orders', async () => {
    mocks.getReport.mockResolvedValue(report(10001));
    const response = await GET(request('period=2026-03'));
    expect(response.status).toBe(422);
    expect(response.headers.get('content-type')).not.toContain('text/csv');
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('denies a non-super-admin before querying the report', async () => {
    mocks.role.mockResolvedValue({ data: false, error: null });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.getReport).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), clearRewards: vi.fn(), vendorSettlements: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ rpc: mocks.rpc })) }));
vi.mock('@/lib/recommendations/reward-clearing', () => ({ clearMaturedRecommendationRewards: mocks.clearRewards }));
vi.mock('@/lib/vendor/settlement', () => ({ runVendorSettlementMaintenance: mocks.vendorSettlements }));

import { POST } from '../route';

describe('/api/internal/wallet-maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    mocks.rpc.mockResolvedValue({ data: { count: 2 }, error: null });
    mocks.clearRewards.mockResolvedValue({ cleared: [{ id: 'r1' }], skipped: [] });
    mocks.vendorSettlements.mockResolvedValue({ cleared: 0, reversed: 0, backfilled: 0, clawedBack: 0 });
  });

  it('rejects missing or invalid cron secrets', async () => {
    expect((await POST(new Request('http://localhost/api/internal/wallet-maintenance', { method: 'POST' }))).status).toBe(401);
    expect((await POST(new Request('http://localhost/api/internal/wallet-maintenance', { method: 'POST', headers: { authorization: 'Bearer wrong' } }))).status).toBe(401);
  });

  it('runs escalation, reward clearance, vendor settlement and current Malaysia report', async () => {
    const response = await POST(new Request('http://localhost/api/internal/wallet-maintenance', { method: 'POST', headers: { authorization: 'Bearer test-secret' } }));
    expect(response.status).toBe(200);
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(['escalate_withdrawals', 'generate_monthly_payout_report']);
    expect(mocks.clearRewards).toHaveBeenCalledOnce();
    expect(mocks.vendorSettlements).toHaveBeenCalledOnce();
  });
});

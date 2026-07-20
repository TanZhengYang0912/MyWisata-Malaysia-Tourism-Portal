import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), serviceRpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ rpc: mocks.serviceRpc })) }));

import { GET } from '../route';

describe('/api/admin/reports/payouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.serviceRpc.mockResolvedValue({ data: { summary: { total_requested: 1 } }, error: null });
  });

  it('requires super admin access', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await GET(new Request('http://localhost/api/admin/reports/payouts?period=2026-07'))).status).toBe(403);
  });

  it('rejects malformed report periods', async () => {
    expect((await GET(new Request('http://localhost/api/admin/reports/payouts?period=July'))).status).toBe(422);
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });

  it('generates a Malaysia-month report through the service RPC', async () => {
    const response = await GET(new Request('http://localhost/api/admin/reports/payouts?period=2026-07'));
    expect(response.status).toBe(200);
    expect(mocks.serviceRpc).toHaveBeenCalledWith('generate_monthly_payout_report', { p_period_start: '2026-07-01', p_generated_by: 'super_admin' });
  });
});

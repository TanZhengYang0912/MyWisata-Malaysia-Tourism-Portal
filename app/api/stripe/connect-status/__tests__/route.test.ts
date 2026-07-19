import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  select: vi.fn(),
  selectEq: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  retrieveConnectAccountStatus: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: mocks.select,
      update: mocks.update,
    }),
  }),
}));

vi.mock('@/lib/stripe/connect-status', () => ({
  retrieveConnectAccountStatus: mocks.retrieveConnectAccountStatus,
}));

import { GET } from '../route';

const userId = '11111111-1111-4111-8111-111111111111';

describe('GET /api/stripe/connect-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mocks.select.mockReturnValue({ eq: mocks.selectEq });
    mocks.selectEq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.update.mockReturnValue({ eq: mocks.updateEq });
    mocks.updateEq.mockResolvedValue({ error: null });
  });

  it('syncs an enabled Stripe account to the user row', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { tier: 'kyc_verified', stripe_connect_account_id: 'acct_enabled', stripe_payouts_enabled: false },
      error: null,
    });
    mocks.retrieveConnectAccountStatus.mockResolvedValue({
      accountId: 'acct_enabled',
      accountType: 'standard',
      dashboardType: 'full',
      detailsSubmitted: true,
      payoutsEnabled: true,
      chargesEnabled: true,
      requiresDashboardAction: false,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { accountId: 'acct_enabled', payoutsEnabled: true, sync: 'stripe' },
    });
    expect(mocks.update).toHaveBeenCalledWith({ stripe_payouts_enabled: true });
  });

  it('returns Dashboard action guidance for an incomplete Full Dashboard account', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { tier: 'kyc_verified', stripe_connect_account_id: 'acct_incomplete', stripe_payouts_enabled: false },
      error: null,
    });
    mocks.retrieveConnectAccountStatus.mockResolvedValue({
      accountId: 'acct_incomplete',
      accountType: 'standard',
      dashboardType: 'full',
      detailsSubmitted: false,
      payoutsEnabled: false,
      chargesEnabled: false,
      requiresDashboardAction: true,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { requiresDashboardAction: true, payoutsEnabled: false },
    });
    expect(mocks.update).toHaveBeenCalledWith({ stripe_payouts_enabled: false });
  });

  it('fails closed when Stripe status retrieval fails', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { tier: 'kyc_verified', stripe_connect_account_id: 'acct_unavailable', stripe_payouts_enabled: false },
      error: null,
    });
    mocks.retrieveConnectAccountStatus.mockRejectedValue(new Error('Stripe unavailable'));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'STRIPE_STATUS_UNAVAILABLE' } });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  select: vi.fn(),
  selectEq: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  rpc: vi.fn(),
  retrieveConnectAccountStatus: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
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
    mocks.rpc.mockResolvedValue({ data: null, error: null });
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
      payoutStatus: 'payouts_enabled',
      requirementCounts: { currentlyDue: 0, pastDue: 0, pendingVerification: 0 },
      disabledReason: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { accountId: 'acct_enabled', payoutsEnabled: true, payoutStatus: 'payouts_enabled', sync: 'stripe' },
    });
    expect(mocks.rpc).toHaveBeenCalledWith('update_connect_status', {
      p_connect_account_id: 'acct_enabled',
      p_payouts_enabled: true,
    });
  });

  it('returns accurate currently-due guidance without raw requirement fields', async () => {
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
      payoutStatus: 'currently_due',
      requirementCounts: { currentlyDue: 1, pastDue: 0, pendingVerification: 0 },
      disabledReason: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      data: { payoutStatus: 'currently_due', payoutsEnabled: false },
    });
    expect(JSON.stringify(body)).not.toContain('external_account');
    expect(mocks.rpc).toHaveBeenCalledWith('update_connect_status', {
      p_connect_account_id: 'acct_incomplete',
      p_payouts_enabled: false,
    });
  });

  it('returns pending verification as a no-action status', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { tier: 'kyc_verified', stripe_connect_account_id: 'acct_pending' },
      error: null,
    });
    mocks.retrieveConnectAccountStatus.mockResolvedValue({
      accountId: 'acct_pending',
      accountType: 'standard',
      dashboardType: 'full',
      detailsSubmitted: true,
      payoutsEnabled: false,
      chargesEnabled: false,
      payoutStatus: 'pending_verification',
      requirementCounts: { currentlyDue: 0, pastDue: 0, pendingVerification: 1 },
      disabledReason: 'requirements.pending_verification',
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { payoutStatus: 'pending_verification', payoutsEnabled: false },
    });
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
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(['acct_demo_1234567890', '601234567890'])('treats legacy or invalid account ID %s as unlinked', async (accountId) => {
    mocks.maybeSingle.mockResolvedValue({
      data: { tier: 'kyc_verified', stripe_connect_account_id: accountId },
      error: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { accountId: null, payoutStatus: 'unlinked', payoutsEnabled: false },
    });
    expect(mocks.retrieveConnectAccountStatus).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

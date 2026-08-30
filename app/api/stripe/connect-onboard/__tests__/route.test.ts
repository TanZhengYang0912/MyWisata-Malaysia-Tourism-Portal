import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  rpc: vi.fn(),
  accountsCreate: vi.fn(),
  accountLinksCreate: vi.fn(),
  retrieveConnectAccountStatus: vi.fn(),
  resolveEffectiveCapability: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({ resolveEffectiveCapability: mocks.resolveEffectiveCapability }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ single: mocks.single }),
      }),
      update: (payload: unknown) => {
        mocks.update(payload);
        return { eq: mocks.updateEq };
      },
    }),
  }),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: { create: mocks.accountsCreate },
    accountLinks: { create: mocks.accountLinksCreate },
  },
}));

vi.mock('@/lib/stripe/connect-status', () => ({
  retrieveConnectAccountStatus: mocks.retrieveConnectAccountStatus,
}));

const { POST } = await import('../route');

const authUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.com',
};

function request() {
  return new Request('http://localhost/api/stripe/connect-onboard', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000' },
  });
}

describe('POST /api/stripe/connect-onboard', () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.single.mockReset();
    mocks.update.mockReset();
    mocks.updateEq.mockReset().mockResolvedValue({ error: null });
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
    mocks.accountsCreate.mockReset();
    mocks.accountLinksCreate.mockReset();
    mocks.retrieveConnectAccountStatus.mockReset().mockResolvedValue({
      accountId: 'acct_existing123',
      accountType: 'standard',
      dashboardType: null,
      detailsSubmitted: false,
      payoutsEnabled: false,
      chargesEnabled: false,
      payoutStatus: 'currently_due',
      requirementCounts: { currentlyDue: 1, pastDue: 0, pendingVerification: 0 },
      disabledReason: null,
    });
    mocks.resolveEffectiveCapability.mockReset().mockImplementation(async (_userId: string, capability: string) => ({
      capability, allowed: true, blockerCode: null, qualificationPaths: [],
      entitlementGeneration: 7, source: 'policy',
    }));

    mocks.getUser.mockResolvedValue({ data: { user: authUser } });
    mocks.single.mockResolvedValue({
      data: {
        tier: 'kyc_verified',
        kyc_status: 'approved',
        stripe_connect_account_id: null,
        full_name: 'Test User',
        phone: '+60123456789',
        email: authUser.email,
      },
      error: null,
    });
    mocks.accountsCreate.mockResolvedValue({ id: 'acct_real_test123' });
    mocks.accountLinksCreate.mockResolvedValue({ url: 'https://connect.stripe.test/onboarding' });
  });

  it('creates a transfer-only payout account and never enables payouts locally', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://connect.stripe.test/onboarding' });
    expect(mocks.accountsCreate).toHaveBeenCalledWith(expect.objectContaining({
      country: 'MY',
      capabilities: {
        transfers: { requested: true },
      },
      controller: {
        losses: { payments: 'stripe' },
        fees: { payer: 'account' },
        requirement_collection: 'stripe',
        stripe_dashboard: { type: 'full' },
      },
    }));
    expect(mocks.update).toHaveBeenCalledWith({
      stripe_connect_account_id: 'acct_real_test123',
      stripe_payouts_enabled: false,
    });
    expect(mocks.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ stripe_payouts_enabled: true }),
    );
    expect(mocks.accountsCreate).not.toHaveBeenCalledWith(expect.objectContaining({
      capabilities: expect.objectContaining({ card_payments: expect.anything() }),
    }));
    expect(mocks.accountLinksCreate).toHaveBeenCalledWith(expect.objectContaining({
      collection_options: {
        fields: 'currently_due',
        future_requirements: 'omit',
      },
    }));
  });

  it('replaces a legacy demo account with a real Stripe account', async () => {
    mocks.single.mockResolvedValue({
      data: {
        tier: 'kyc_verified',
        kyc_status: 'approved',
        stripe_connect_account_id: 'acct_demo_1234567890',
        full_name: 'Test User',
        phone: null,
        email: authUser.email,
      },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.accountsCreate).toHaveBeenCalledTimes(1);
    expect(mocks.accountLinksCreate).toHaveBeenCalledWith(expect.objectContaining({
      account: 'acct_real_test123',
    }));
    expect(mocks.accountLinksCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ account: 'acct_demo_1234567890' }),
    );
  });

  it('reuses a real account and creates a fresh onboarding link', async () => {
    mocks.single.mockResolvedValue({
      data: {
        tier: 'kyc_verified',
        kyc_status: 'approved',
        stripe_connect_account_id: 'acct_existing123',
        full_name: 'Test User',
        phone: null,
        email: authUser.email,
      },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.accountsCreate).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('update_connect_status', {
      p_connect_account_id: 'acct_existing123',
      p_payouts_enabled: false,
    });
    expect(mocks.accountLinksCreate).toHaveBeenCalledWith(expect.objectContaining({
      account: 'acct_existing123',
      type: 'account_onboarding',
    }));
  });

  it('returns verified status and skips Account Links for an enabled account', async () => {
    mocks.single.mockResolvedValue({
      data: {
        tier: 'kyc_verified',
        kyc_status: 'approved',
        stripe_connect_account_id: 'acct_enabled',
        full_name: 'Test User',
        phone: null,
        email: authUser.email,
      },
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

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'verified', accountId: 'acct_enabled' });
    expect(mocks.accountLinksCreate).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('update_connect_status', {
      p_connect_account_id: 'acct_enabled',
      p_payouts_enabled: true,
    });
  });

  it('creates a hosted remediation link for currently-due requirements', async () => {
    mocks.single.mockResolvedValue({
      data: {
        tier: 'kyc_verified',
        kyc_status: 'approved',
        stripe_connect_account_id: 'acct_incomplete',
        full_name: 'Test User',
        phone: null,
        email: authUser.email,
      },
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

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://connect.stripe.test/onboarding' });
    expect(mocks.accountLinksCreate).toHaveBeenCalledWith(expect.objectContaining({
      account: 'acct_incomplete',
      type: 'account_onboarding',
      collection_options: { fields: 'currently_due', future_requirements: 'omit' },
    }));
    expect(mocks.rpc).toHaveBeenCalledWith('update_connect_status', {
      p_connect_account_id: 'acct_incomplete',
      p_payouts_enabled: false,
    });
  });

  it('returns pending verification without creating another onboarding link', async () => {
    mocks.single.mockResolvedValue({
      data: {
        tier: 'kyc_verified',
        kyc_status: 'approved',
        stripe_connect_account_id: 'acct_pending',
        full_name: 'Test User',
        phone: null,
        email: authUser.email,
      },
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

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'pending_verification', accountId: 'acct_pending' });
    expect(mocks.accountLinksCreate).not.toHaveBeenCalled();
  });

  it('does not start onboarding before KYC verification', async () => {
    mocks.resolveEffectiveCapability.mockResolvedValue({
      capability: 'wallet.request_withdrawal', allowed: false,
      blockerCode: 'KYC_REQUIRED', qualificationPaths: [{ type: 'kyc', href: '/customer/kyc' }],
      entitlementGeneration: 7, source: 'hard_guard',
    });
    mocks.single.mockResolvedValue({
      data: {
        tier: 'profile_complete',
        kyc_status: 'unverified',
        stripe_connect_account_id: null,
        full_name: 'Test User',
        phone: null,
        email: authUser.email,
      },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.accountsCreate).not.toHaveBeenCalled();
    expect(mocks.accountLinksCreate).not.toHaveBeenCalled();
  });

  it('allows approved KYC without Phone or Profile facts', async () => {
    mocks.single.mockResolvedValue({
      data: {
        stripe_connect_account_id: null,
        full_name: null,
        phone: null,
        email: authUser.email,
      },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.resolveEffectiveCapability).toHaveBeenCalledWith(authUser.id, 'wallet.request_withdrawal');
    expect(mocks.accountsCreate).toHaveBeenCalledOnce();
  });

  it('returns a generic 502 when Stripe onboarding fails', async () => {
    mocks.accountsCreate.mockRejectedValue({ type: 'StripeInvalidRequestError', requestId: 'req_test' });

    const response = await POST(request());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Unable to start Stripe onboarding' });
  });
});

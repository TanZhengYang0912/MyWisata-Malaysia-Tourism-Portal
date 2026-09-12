import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  select: vi.fn(),
  selectEq: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  upsertSelect: vi.fn(),
  upsertSingle: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  rpc: vi.fn(),
  enqueueWithdrawalEmail: vi.fn(),
  retrieveConnectAccountStatus: vi.fn(),
  notifyWithdrawalApprovers: vi.fn(),
  serviceRpc: vi.fn(),
  serviceFrom: vi.fn(),
  resolveEffectiveCapability: vi.fn(),
  capabilities: vi.fn(),
  resolveTngIdentity: vi.fn(),
  tngMatches: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({ resolveEffectiveCapability: mocks.resolveEffectiveCapability }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: mocks.select, update: mocks.update, upsert: mocks.upsert }),
    rpc: mocks.rpc,
  })),
}));
vi.mock('@/lib/email/events', () => ({ enqueueWithdrawalEmail: mocks.enqueueWithdrawalEmail }));
vi.mock('@/lib/stripe/connect-status', () => ({
  retrieveConnectAccountStatus: mocks.retrieveConnectAccountStatus,
}));
vi.mock('@/lib/wallet/approver-notifications', () => ({ notifyWithdrawalApprovers: mocks.notifyWithdrawalApprovers }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ rpc: mocks.serviceRpc, from: mocks.serviceFrom })) }));
vi.mock('@/lib/payouts/destinations', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/payouts/destinations')>();
  return { ...original, getPayoutDestinationCapabilities: mocks.capabilities };
});
vi.mock('@/lib/payouts/tng-identity', () => ({
  resolveVerifiedTngIdentity: mocks.resolveTngIdentity,
  tngDestinationMatchesIdentity: mocks.tngMatches,
}));

import { POST } from '../route';

const requestId = '44444444-4444-4444-8444-444444444444';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/wallet/withdrawals', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId, ...body }),
  });
}

describe('POST /api/wallet/withdrawals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null });
    mocks.select.mockReturnValue({ eq: mocks.selectEq });
    mocks.serviceFrom.mockReturnValue({ select: mocks.select });
    mocks.selectEq.mockReturnValue({ eq: mocks.selectEq, maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: { stripe_connect_account_id: 'acct_test', phone_verified_at: '2026-07-22T00:00:00.000Z', kyc_status: 'approved', tier: 'kyc_verified' }, error: null });
    mocks.upsert.mockReturnValue({ select: mocks.upsertSelect });
    mocks.upsertSelect.mockReturnValue({ single: mocks.upsertSingle });
    mocks.upsertSingle.mockResolvedValue({ data: { id: 'destination-1' }, error: null });
    mocks.update.mockReturnValue({ eq: mocks.updateEq });
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.retrieveConnectAccountStatus.mockResolvedValue({
      accountId: 'acct_test',
      accountType: 'standard',
      dashboardType: 'full',
      detailsSubmitted: true,
      payoutsEnabled: true,
      chargesEnabled: true,
      requiresDashboardAction: false,
    });
    mocks.serviceRpc.mockImplementation(async (name: string) => name === 'save_verified_payout_destination'
      ? { data: { id: 'destination-1' }, error: null }
      : { data: { request_id: requestId, replayed: false }, error: null });
    mocks.resolveEffectiveCapability.mockImplementation(async (_userId: string, capability: string) => ({
      capability, allowed: true, blockerCode: null, qualificationPaths: [],
      entitlementGeneration: 7, source: 'policy',
    }));
    mocks.capabilities.mockReturnValue({ bank_account: { enabled: true, provider: 'stripe_connect' }, e_wallet: { enabled: true, provider: 'tng_direct_credit' } });
    mocks.resolveTngIdentity.mockResolvedValue({
      ok: true,
      identity: { providerReference: 'tng_dest_current', maskedReference: '+60••••3951', verifiedPhone: '+60177143951', profilePhone: '+60 17-714 3951' },
    });
    mocks.tngMatches.mockReturnValue(false);
  });

  it('submits only an integer-sen amount to the authenticated withdrawal RPC', async () => {
    const response = await POST(request({ amountRm: '50.25' }));

    expect(response.status).toBe(201);
    expect(mocks.serviceRpc).toHaveBeenCalledWith('submit_wallet_withdrawal_server', {
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_request_id: requestId,
      p_amount_sen: 5025,
      p_destination_id: 'destination-1',
      p_expected_tng_phone: null,
      p_expected_provider_reference: null,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith('submit_wallet_withdrawal', expect.anything());
    expect(mocks.serviceRpc).toHaveBeenCalledWith('save_verified_payout_destination', expect.objectContaining({
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_provider: 'stripe_connect',
      p_provider_reference: 'acct_test',
    }));
  });

  it('allows approved KYC without requiring Phone or Profile completion', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        stripe_connect_account_id: 'acct_test',
        phone_verified_at: null,
        kyc_status: 'approved',
        tier: 'email_verified',
      },
      error: null,
    });
    const response = await POST(request({ amountRm: '50.00' }));

    expect(response.status).toBe(201);
    expect(mocks.resolveEffectiveCapability).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'wallet.request_withdrawal',
    );
    expect(mocks.retrieveConnectAccountStatus).toHaveBeenCalled();
  });

  it('maps KYC enforcement to a customer-safe error', async () => {
    mocks.resolveEffectiveCapability.mockResolvedValue({
      capability: 'wallet.request_withdrawal', allowed: false,
      blockerCode: 'KYC_REQUIRED', qualificationPaths: [{ type: 'kyc', href: '/customer/kyc' }],
      entitlementGeneration: 7, source: 'hard_guard',
    });

    const response = await POST(request({ amountRm: '50.00' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'KYC_REQUIRED' } });
    expect(mocks.retrieveConnectAccountStatus).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('reconciles an enabled Stripe account before submitting the withdrawal RPC', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { stripe_connect_account_id: 'acct_enabled', phone_verified_at: '2026-07-22T00:00:00.000Z', kyc_status: 'approved', tier: 'kyc_verified' }, error: null });
    mocks.retrieveConnectAccountStatus.mockResolvedValue({
      accountId: 'acct_enabled',
      accountType: 'standard',
      dashboardType: 'full',
      detailsSubmitted: true,
      payoutsEnabled: true,
      chargesEnabled: true,
      requiresDashboardAction: false,
    });
    const response = await POST(request({ amountRm: '50.25' }));

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('update_connect_status', {
      p_connect_account_id: 'acct_enabled',
      p_payouts_enabled: true,
    });
    expect(mocks.serviceRpc).toHaveBeenCalledWith('submit_wallet_withdrawal_server', expect.objectContaining({
      p_request_id: requestId,
      p_amount_sen: 5025,
      p_destination_id: 'destination-1',
    }));
  });

  it('fails closed and skips the withdrawal RPC when Stripe status cannot be read', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { stripe_connect_account_id: 'acct_unavailable', phone_verified_at: '2026-07-22T00:00:00.000Z', kyc_status: 'approved', tier: 'kyc_verified' }, error: null });
    mocks.retrieveConnectAccountStatus.mockRejectedValue(new Error('Stripe unavailable'));

    const response = await POST(request({ amountRm: '50.00' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'STRIPE_STATUS_UNAVAILABLE' } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects a historical TNG destination that does not match the verified account phone', async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: { stripe_connect_account_id: null }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: '33333333-3333-4333-8333-333333333333',
          dest_type: 'ewallet',
          provider: 'tng_direct_credit',
          provider_reference: 'tng_dest_old',
          verification_status: 'verified',
          cooldown_until: null,
        },
        error: null,
      });

    const response = await POST(request({
      amountRm: '50.00',
      destinationId: '33333333-3333-4333-8333-333333333333',
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PAYOUT_DESTINATION_IDENTITY_MISMATCH' } });
    expect(mocks.resolveTngIdentity).toHaveBeenCalledWith(expect.anything(), '11111111-1111-4111-8111-111111111111');
    expect(mocks.rpc).not.toHaveBeenCalledWith('submit_wallet_withdrawal', expect.anything());
  });

  it('submits through a TNG destination only when its opaque reference matches', async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: { stripe_connect_account_id: null }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: '33333333-3333-4333-8333-333333333333',
          dest_type: 'ewallet',
          provider: 'tng_direct_credit',
          provider_reference: 'tng_dest_current',
          verification_status: 'verified',
          cooldown_until: null,
        },
        error: null,
      });
    mocks.tngMatches.mockReturnValue(true);
    const response = await POST(request({
      amountRm: '50.00',
      destinationId: '33333333-3333-4333-8333-333333333333',
    }));

    expect(response.status).toBe(201);
    expect(mocks.serviceRpc).toHaveBeenCalledWith('submit_wallet_withdrawal_server', {
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_request_id: requestId,
      p_amount_sen: 5000,
      p_destination_id: '33333333-3333-4333-8333-333333333333',
      p_expected_tng_phone: '+60 17-714 3951',
      p_expected_provider_reference: 'tng_dest_current',
    });
  });

  it('rejects a missing or malformed request identity before any money RPC', async () => {
    const response = await POST(request({ amountRm: '50.00', requestId: 'not-a-uuid' }));

    expect(response.status).toBe(422);
    expect(mocks.serviceRpc).not.toHaveBeenCalledWith('submit_wallet_withdrawal_server', expect.anything());
  });

  it('does not duplicate email or approver side effects for an idempotent replay', async () => {
    mocks.serviceRpc.mockImplementation(async (name: string) => name === 'save_verified_payout_destination'
      ? { data: { id: 'destination-1' }, error: null }
      : { data: { request_id: requestId, replayed: true }, error: null });

    const response = await POST(request({ amountRm: '50.00' }));

    expect(response.status).toBe(201);
    expect(mocks.enqueueWithdrawalEmail).not.toHaveBeenCalled();
    expect(mocks.notifyWithdrawalApprovers).not.toHaveBeenCalled();
  });
});

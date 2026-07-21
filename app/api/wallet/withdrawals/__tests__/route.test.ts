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
}));

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

import { POST } from '../route';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/wallet/withdrawals', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/wallet/withdrawals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null });
    mocks.select.mockReturnValue({ eq: mocks.selectEq });
    mocks.selectEq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: { stripe_connect_account_id: 'acct_test', phone_verified_at: '2026-07-22T00:00:00.000Z', kyc_status: 'approved' }, error: null });
    mocks.upsert.mockReturnValue({ select: mocks.upsertSelect });
    mocks.upsertSelect.mockReturnValue({ single: mocks.upsertSingle });
    mocks.upsertSingle.mockResolvedValue({ data: { id: 'destination-1' }, error: null });
    mocks.update.mockReturnValue({ eq: mocks.updateEq });
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.retrieveConnectAccountStatus.mockResolvedValue({
      accountId: 'acct_test',
      accountType: 'standard',
      dashboardType: 'full',
      detailsSubmitted: true,
      payoutsEnabled: true,
      chargesEnabled: true,
      requiresDashboardAction: false,
    });
  });

  it('submits only an integer-sen amount to the authenticated withdrawal RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { request_id: '22222222-2222-4222-8222-222222222222', requires_dual_approval: false }, error: null });

    const response = await POST(request({ amountRm: '50.25' }));

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('submit_wallet_withdrawal', { p_amount_sen: 5025, p_destination_id: 'destination-1' });
  });

  it('maps KYC enforcement to a customer-safe error', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'kyc_required' } });

    const response = await POST(request({ amountRm: '50.00' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'KYC_REQUIRED' } });
  });

  it('reconciles an enabled Stripe account before submitting the withdrawal RPC', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { stripe_connect_account_id: 'acct_enabled', phone_verified_at: '2026-07-22T00:00:00.000Z', kyc_status: 'approved' }, error: null });
    mocks.retrieveConnectAccountStatus.mockResolvedValue({
      accountId: 'acct_enabled',
      accountType: 'standard',
      dashboardType: 'full',
      detailsSubmitted: true,
      payoutsEnabled: true,
      chargesEnabled: true,
      requiresDashboardAction: false,
    });
    mocks.rpc.mockResolvedValue({ data: { request_id: '22222222-2222-4222-8222-222222222222' }, error: null });

    const response = await POST(request({ amountRm: '50.25' }));

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('update_connect_status', {
      p_connect_account_id: 'acct_enabled',
      p_payouts_enabled: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('submit_wallet_withdrawal', { p_amount_sen: 5025, p_destination_id: 'destination-1' });
  });

  it('fails closed and skips the withdrawal RPC when Stripe status cannot be read', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { stripe_connect_account_id: 'acct_unavailable', phone_verified_at: '2026-07-22T00:00:00.000Z', kyc_status: 'approved' }, error: null });
    mocks.retrieveConnectAccountStatus.mockRejectedValue(new Error('Stripe unavailable'));

    const response = await POST(request({ amountRm: '50.00' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'STRIPE_STATUS_UNAVAILABLE' } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  rpc: vi.fn(),
  retrieveConnectAccountStatus: vi.fn(),
  enqueueWithdrawalEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc })) }));
vi.mock('@/lib/stripe/connect-status', () => ({ retrieveConnectAccountStatus: mocks.retrieveConnectAccountStatus }));
vi.mock('@/lib/email/events', () => ({ enqueueWithdrawalEmail: mocks.enqueueWithdrawalEmail }));

import { POST } from '../route';

function request() {
  return new Request('http://localhost/api/wallet/withdrawals', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amountRm: '50.00' }),
  });
}

describe('withdrawal destination and eligibility gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.from.mockReturnValue({ select: mocks.select, upsert: mocks.upsert });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.retrieveConnectAccountStatus.mockResolvedValue({ accountId: 'acct_test', payoutsEnabled: true });
    mocks.rpc.mockResolvedValue({ data: { request_id: 'withdrawal-1' }, error: null });
    mocks.enqueueWithdrawalEmail.mockResolvedValue(undefined);
  });

  it('blocks withdrawal before payout status sync when phone is not verified', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { stripe_connect_account_id: 'acct_test', phone_verified_at: null, kyc_status: 'approved' }, error: null });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PHONE_VERIFICATION_REQUIRED' } });
    expect(mocks.retrieveConnectAccountStatus).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

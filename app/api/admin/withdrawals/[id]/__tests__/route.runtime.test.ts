import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

import { GET } from '../route';

const WITHDRAWAL_ID = '7256ca68-4e80-4ef4-91f3-7ccbad0e3934';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const APPROVER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function request() {
  return new Request(`http://localhost/api/admin/withdrawals/${WITHDRAWAL_ID}`);
}

function params() {
  return { params: Promise.resolve({ id: WITHDRAWAL_ID }) };
}

function withdrawalQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    single: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.single.mockResolvedValue({
    data: {
      id: WITHDRAWAL_ID,
      user_id: USER_ID,
      amount: 100,
      status: 'pending',
      requires_dual_approval: false,
      destination_label: 'Stripe Connect',
      destination_provider: 'stripe_connect',
      destination_masked_ref: '···1234',
      payout_provider: null,
      payout_provider_event_id: null,
      payout_failure_code: null,
      payout_failure_message: null,
      payout_failure_category: null,
      payout_failure_at: null,
      payout_failure_retryable: null,
      payout_execution_claim_token: '11111111-1111-4111-8111-111111111111',
      payout_execution_claimed_at: '2026-07-22T00:01:00.000Z',
      customer_reason: null,
      created_at: '2026-07-22T00:00:00.000Z',
      updated_at: '2026-07-22T00:00:00.000Z',
      users: {
        full_name: 'Customer',
        email: 'customer@example.com',
        kyc_status: 'approved',
        tier: 'kyc_verified',
        stripe_connect_account_id: 'acct_test123',
        kyc_submissions: [],
      },
      wallets: {
        topup_sen: 0,
        earnings_sen: 10000,
        pending_earnings_sen: 0,
        reserved_earnings_sen: 0,
        withdrawn_earnings_sen: 0,
      },
      withdrawal_approvals: [],
      withdrawal_risk_assessments: [],
    },
    error: null,
  });
  return query;
}

describe('GET /api/admin/withdrawals/:id runtime behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const rpc = vi.fn((name: string) => {
      if (name === 'is_approver') return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: null, error: { message: 'function get_withdrawal_review_sources does not exist' } });
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: APPROVER_ID } }, error: null }) },
      rpc,
      from: vi.fn(() => withdrawalQuery()),
    });
  });

  it('still opens the withdrawal detail when the optional review-source RPC is unavailable', async () => {
    const response = await GET(request(), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.reviewSources).toEqual({
      rewardSources: [],
      affiliateSources: [],
      walletTransactions: [],
      fraudFlags: [],
    });
    expect(body.data.payoutExecution).toEqual({ locked: true, claimedAt: '2026-07-22T00:01:00.000Z' });
  });
});

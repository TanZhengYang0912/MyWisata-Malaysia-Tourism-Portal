import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  getUser:              vi.fn(),
  rpc:                  vi.fn(),
  from:                 vi.fn(),
  transfersCreate:      vi.fn(),
  transfersRetrieve:    vi.fn(),
  payoutsCreate:        vi.fn(),
  payoutsRetrieve:      vi.fn(),
  accountsRetrieve:     vi.fn(),
  moderateWalletAction:  vi.fn(),
  enqueueWithdrawalEmail: vi.fn(),
  createTngPayout:       vi.fn(),
  tngIsConfigured:       vi.fn(),
  executeApprovedWithdrawalPayout: vi.fn(),
  scheduleTngMockCallbackAcceleration: vi.fn(),
  requireStaffPermission: vi.fn(),
}));

function db() {
  return {
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: mocks.from,
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => db()),
}));
vi.mock('@/lib/staff-permissions/server', () => ({ requireStaffPermission: mocks.requireStaffPermission }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    transfers: { create: mocks.transfersCreate, retrieve: mocks.transfersRetrieve },
    payouts:   { create: mocks.payoutsCreate,   retrieve: mocks.payoutsRetrieve },
    accounts:  { retrieve: mocks.accountsRetrieve },
  },
}));

vi.mock('@/lib/wallet/moderation-guard', () => ({ moderateWalletAction: mocks.moderateWalletAction }));
vi.mock('@/lib/email/events', () => ({ enqueueWithdrawalEmail: mocks.enqueueWithdrawalEmail }));
vi.mock('@/lib/payouts/providers/tng-direct-credit', () => ({
  createTngDirectCreditProvider: vi.fn(() => ({
    isConfigured: mocks.tngIsConfigured,
    createPayout: mocks.createTngPayout,
  })),
}));
vi.mock('@/lib/payouts/execute-approved-withdrawal', () => ({
  executeApprovedWithdrawalPayout: mocks.executeApprovedWithdrawalPayout,
}));
vi.mock('@/lib/payouts/tng-mock-callbacks', () => ({
  scheduleTngMockCallbackAcceleration: mocks.scheduleTngMockCallbackAcceleration,
}));

import { POST } from '../route';

// ── Helpers ──────────────────────────────────────────────────────────────────
const W_ID  = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U_ID  = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const U2_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function request(body: Record<string, unknown> = { note: 'Review completed for payout.', reasonCategory: 'review_completed' }) {
  return new Request(`http://localhost/api/admin/withdrawals/${W_ID}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ id: W_ID }) };
}

function mockWithdrawal(overrides: Record<string, unknown> = {}) {
  const select = vi.fn().mockReturnThis();
  const eq     = vi.fn().mockReturnThis();
  const single = vi.fn().mockResolvedValue({
    data: {
      status: 'pending',
      user_id: U_ID,
      amount: 100,
      stripe_transfer_id: null,
      stripe_payout_id: null,
      payout_provider: 'stripe_connect',
      destination_provider_reference: 'acct_test123',
      updated_at: new Date().toISOString(),
      requires_dual_approval: false,
      ...overrides,
    },
    error: null,
  });
  mocks.from.mockReturnValue({ select, eq, single });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/admin/withdrawals/:id/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks preserves mock implementations and queued return values;
    // reset the fluent Supabase mocks so a validation-short-circuit test does
    // not leak a queued row into the next test.
    mocks.from.mockReset();
    mocks.rpc.mockReset();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: U2_ID } },
      error: null,
    });
    mocks.requireStaffPermission.mockResolvedValue({ db: db(), user: { id: U2_ID }, response: null });
    mocks.enqueueWithdrawalEmail.mockResolvedValue(undefined);
    mocks.moderateWalletAction.mockResolvedValue({ ok: true, categories: [] });
    mocks.tngIsConfigured.mockReturnValue(true);
    mocks.createTngPayout.mockResolvedValue({
      status: 'processing',
      providerEventId: 'tng_payout_0123456789abcdef0123456789abcdef',
      failure: null,
    });
    mocks.executeApprovedWithdrawalPayout.mockResolvedValue({
      ok: true,
      data: { status: 'processing', provider: 'stripe_connect', transfer_id: 'tr_test', payout_id: 'po_test' },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.requireStaffPermission.mockResolvedValue({
      db: db(),
      user: null,
      response: Response.json({ data: null, error: { code: 'UNAUTHORIZED' } }, { status: 401 }),
    });
    const res = await POST(request(), params());
    expect(res.status).toBe(401);
  });

  it('requires admin.withdrawal.approve before parsing or starting moderation', async () => {
    mocks.requireStaffPermission.mockResolvedValue({
      db: db(),
      user: { id: U2_ID },
      response: Response.json({ data: null, error: { code: 'FORBIDDEN' } }, { status: 403 }),
    });
    const res = await POST(new Request(`http://localhost/api/admin/withdrawals/${W_ID}/approve`, {
      method: 'POST',
      body: '{invalid-json',
    }), params());
    expect(res.status).toBe(403);
    expect(mocks.requireStaffPermission).toHaveBeenCalledWith('admin.withdrawal.approve');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.moderateWalletAction).not.toHaveBeenCalled();
  });

  it('fails closed if the database permission is revoked after the route guard', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'withdrawal_permission_required' } });

    const res = await POST(request(), params());

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(mocks.executeApprovedWithdrawalPayout).not.toHaveBeenCalled();
  });

  it('returns pending_second_approval for first approval on a dual-approval request', async () => {
    mockWithdrawal({ requires_dual_approval: true });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'approve_wallet_withdrawal') {
        return Promise.resolve({
          data: { status: 'pending_second_approval', ready: false, approval_count: 1, required_approvals: 2, risk_level: 'low' },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(request(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data?.status ?? body.status).toBe('pending_second_approval');
    expect(mocks.transfersCreate).not.toHaveBeenCalled();
    expect(mocks.scheduleTngMockCallbackAcceleration).not.toHaveBeenCalled();
  });

  it('returns 409 when same approver attempts a second approval', async () => {
    mockWithdrawal({ requires_dual_approval: true });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'already_approved_by_this_actor' },
    });
    const res = await POST(request(), params());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/DUPLICATE_APPROVAL|already_approved/i);
    expect(body.error.message).toContain('another Approver or Super Admin');
  });

  it('tells an approver who must handle their own withdrawal', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'self_dealing' } });
    const res = await POST(request(), params());
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.message).toContain('another Approver or Super Admin');
  });

  it('returns 409 HIGH_RISK_OVERRIDE_REQUIRED when risk is high and not overridden', async () => {
    mockWithdrawal();
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'high_risk_override_required' },
    });
    const res = await POST(request(), params());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/HIGH_RISK_OVERRIDE_REQUIRED/);
  });

  it('starts payout execution when second distinct approver approves', async () => {
    mockWithdrawal({ requires_dual_approval: true, status: 'pending_second_approval' });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'approve_wallet_withdrawal') {
        return Promise.resolve({
          data: { status: 'approved', ready: true, approval_count: 2, required_approvals: 2, risk_level: 'low', user_id: U_ID, amount_rm: 100 },
          error: null,
        });
      }
      return Promise.resolve({ data: {}, error: null });
    });
    const res = await POST(request(), params());
    const body = await res.json();

    expect(mocks.executeApprovedWithdrawalPayout).toHaveBeenCalledWith({
      withdrawalId: W_ID,
      userId: U_ID,
      amountRm: 100,
    });
    expect((body.data?.status ?? body.status)).toBe('processing');
  });

  it('routes a ready withdrawal through the shared payout executor', async () => {
    mockWithdrawal({
      payout_provider: 'tng_direct_credit',
      destination_provider_reference: 'tng_dest_0123456789abcdef0123456789abcdef',
    });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'approve_wallet_withdrawal') {
        return Promise.resolve({
          data: {
            status: 'approved',
            ready: true,
            approval_count: 1,
            required_approvals: 1,
            risk_level: 'low',
            user_id: U_ID,
            amount_rm: 100,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: {}, error: null });
    });
    mocks.executeApprovedWithdrawalPayout.mockResolvedValue({
      ok: true,
      data: {
        status: 'processing',
        provider: 'tng_direct_credit',
        callbackJobId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        callbackAvailableAt: '2026-08-21T05:00:03.000Z',
      },
    });

    const res = await POST(request(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.executeApprovedWithdrawalPayout).toHaveBeenCalledWith({
      withdrawalId: W_ID,
      userId: U_ID,
      amountRm: 100,
    });
    expect(body.data).toMatchObject({ status: 'processing', provider: 'tng_direct_credit' });
    expect(body.data).not.toHaveProperty('callbackJobId');
    expect(body.data).not.toHaveProperty('callbackAvailableAt');
    expect(mocks.scheduleTngMockCallbackAcceleration).toHaveBeenCalledWith(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '2026-08-21T05:00:03.000Z',
    );
  });

  it('returns 422 when approve note is present but under 10 characters', async () => {
    const res = await POST(request({ note: 'short', reasonCategory: 'review_completed' }), params());
    expect(res.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires a reason and category for approval', async () => {
    mockWithdrawal();
    mocks.rpc.mockResolvedValue({
      data: { status: 'approved', ready: true, approval_count: 1, required_approvals: 1, risk_level: 'low', user_id: U_ID, amount_rm: 100 },
      error: null,
    });
    const res = await POST(request({}), params());
    expect(res.status).toBe(422);
  });

  it('returns a retryable error when processing state cannot be persisted', async () => {
    mockWithdrawal();
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'approve_wallet_withdrawal') {
        return Promise.resolve({
          data: { status: 'approved', ready: true, approval_count: 1, required_approvals: 1, risk_level: 'low', user_id: U_ID, amount_rm: 100 },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mocks.executeApprovedWithdrawalPayout.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ data: null, error: { code: 'PROCESSING_STATE_FAILED', details: { retryable: true } } }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }),
    });

    const res = await POST(request(), params());
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error?.code).toBe('PROCESSING_STATE_FAILED');
    expect(body.error?.details?.retryable).toBe(true);
  });
});

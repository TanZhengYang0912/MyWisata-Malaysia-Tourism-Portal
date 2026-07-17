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
  moderateAccountText:  vi.fn(),
  enqueueWithdrawalEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc:  mocks.rpc,
    from: mocks.from,
  })),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    transfers: { create: mocks.transfersCreate, retrieve: mocks.transfersRetrieve },
    payouts:   { create: mocks.payoutsCreate,   retrieve: mocks.payoutsRetrieve },
    accounts:  { retrieve: mocks.accountsRetrieve },
  },
}));

vi.mock('@/lib/moderation', () => ({ moderateAccountText: mocks.moderateAccountText }));
vi.mock('@/lib/email/events', () => ({ enqueueWithdrawalEmail: mocks.enqueueWithdrawalEmail }));

import { POST } from '../route';

// ── Helpers ──────────────────────────────────────────────────────────────────
const W_ID  = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U_ID  = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const U2_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function request(body: Record<string, unknown> = {}) {
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
      updated_at: new Date().toISOString(),
      requires_dual_approval: false,
      ...overrides,
    },
    error: null,
  });
  mocks.from.mockReturnValue({ select, eq, single });
}

function mockUserRow(connectId: string | null = 'acct_test123') {
  const select = vi.fn().mockReturnThis();
  const eq     = vi.fn().mockReturnThis();
  const single = vi.fn().mockResolvedValue({
    data: { stripe_connect_account_id: connectId },
    error: null,
  });
  mocks.from.mockReturnValueOnce({ select, eq, single });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/admin/withdrawals/:id/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: U2_ID } },
      error: null,
    });
    mocks.enqueueWithdrawalEmail.mockResolvedValue(undefined);
    mocks.moderateAccountText.mockResolvedValue({ flagged: false });
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(request(), params());
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is an ordinary customer (approver_required)', async () => {
    mockWithdrawal();
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'approver_required' },
    });
    const res = await POST(request(), params());
    expect(res.status).toBe(403);
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

  it('calls Stripe and returns processing when second distinct approver approves', async () => {
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
    mocks.accountsRetrieve.mockResolvedValue({ payouts_enabled: true });
    mocks.transfersCreate.mockResolvedValue({ id: 'tr_test' });
    mocks.payoutsCreate.mockResolvedValue({ id: 'po_test' });
    mockUserRow('acct_test123');

    const res = await POST(request(), params());
    const body = await res.json();

    expect(mocks.transfersCreate).toHaveBeenCalled();
    expect(mocks.payoutsCreate).toHaveBeenCalled();
    expect((body.data?.status ?? body.status)).toBe('processing');
  });

  it('returns 422 when approve note is present but under 10 characters', async () => {
    const res = await POST(request({ note: 'short' }), params());
    expect(res.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('accepts an empty (omitted) note without validation error', async () => {
    mockWithdrawal();
    mocks.rpc.mockResolvedValue({
      data: { status: 'approved', ready: true, approval_count: 1, required_approvals: 1, risk_level: 'low', user_id: U_ID, amount_rm: 100 },
      error: null,
    });
    mocks.accountsRetrieve.mockResolvedValue({ payouts_enabled: true });
    mocks.transfersCreate.mockResolvedValue({ id: 'tr_test' });
    mocks.payoutsCreate.mockResolvedValue({ id: 'po_test' });
    mockUserRow('acct_test123');

    const res = await POST(request({}), params());
    expect(res.status).not.toBe(422);
  });
});

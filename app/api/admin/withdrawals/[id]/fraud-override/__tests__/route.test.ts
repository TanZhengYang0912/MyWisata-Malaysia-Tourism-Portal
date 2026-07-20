import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  getUser:             vi.fn(),
  rpc:                 vi.fn(),
  moderateWalletAction: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc:  mocks.rpc,
  })),
}));

vi.mock('@/lib/wallet/moderation-guard', () => ({ moderateWalletAction: mocks.moderateWalletAction }));

// The route does not exist yet — importing it should cause the test to fail
// (module not found), which is the expected TDD red state.
import { POST } from '../route';

// ── Constants ────────────────────────────────────────────────────────────────
const W_ID      = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SUPER_ID  = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const APPROVER  = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function request(body: Record<string, unknown> = {}) {
  return new Request(`http://localhost/api/admin/withdrawals/${W_ID}/fraud-override`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.1' },
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ id: W_ID }) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/admin/withdrawals/:id/fraud-override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: SUPER_ID } },
      error: null,
    });
    mocks.moderateWalletAction.mockResolvedValue({ ok: true, categories: [] });
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(request({ reason: 'Manually reviewed and confirmed legitimate.' }), params());
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is a Wallet Approver (not Super Admin)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: APPROVER } }, error: null });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'super_admin_required' },
    });
    const res = await POST(request({ reason: 'Manually reviewed and confirmed legitimate.' }), params());
    expect(res.status).toBe(403);
  });

  it('returns 422 when reason is shorter than 10 characters', async () => {
    const res = await POST(request({ reason: 'too short' }), params());
    expect(res.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns 422 when reason is longer than 500 characters', async () => {
    const res = await POST(request({ reason: 'a'.repeat(501) }), params());
    expect(res.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns 422 when reason is absent', async () => {
    const res = await POST(request({}), params());
    expect(res.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns 422 when content is flagged by moderation', async () => {
    mocks.moderateWalletAction.mockResolvedValue({ ok: false, code: 'CONTENT_REJECTED', message: 'Reason rejected by Wallet policy' });
    const res = await POST(request({ reason: 'Manually reviewed and confirmed legitimate.' }), params());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/CONTENT_REJECTED/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns 503 when moderation service is unavailable', async () => {
    mocks.moderateWalletAction.mockResolvedValue({ ok: false, code: 'MODERATION_UNAVAILABLE', message: 'Content review unavailable' });
    const res = await POST(request({ reason: 'Manually reviewed and confirmed legitimate.' }), params());
    expect(res.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns 409 when risk is not high (override not applicable)', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'risk_not_high' },
    });
    const res = await POST(request({ reason: 'Manually reviewed and confirmed legitimate.' }), params());
    expect(res.status).toBe(409);
  });

  it('returns 409 when approver tries to override their own withdrawal (self-dealing)', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'self_dealing' },
    });
    const res = await POST(request({ reason: 'Manually reviewed and confirmed legitimate.' }), params());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/SELF_DEALING/i);
  });

  it('returns 200 with overridden risk_level when Super Admin provides a valid reason', async () => {
    mocks.rpc.mockResolvedValue({
      data: { risk_level: 'review', overridden_at: new Date().toISOString() },
      error: null,
    });
    const res = await POST(request({ reason: 'Manually reviewed and confirmed legitimate.' }), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data?.risk_level ?? body.risk_level).toBe('review');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'override_withdrawal_risk',
      expect.objectContaining({
        p_withdrawal_id: W_ID,
        p_reason: 'Manually reviewed and confirmed legitimate.',
      }),
    );
  });

  it('passes the server-observed IP to the RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: { risk_level: 'review', overridden_at: new Date().toISOString() },
      error: null,
    });
    await POST(request({ reason: 'Manually reviewed and confirmed legitimate.' }), params());
    expect(mocks.rpc).toHaveBeenCalledWith(
      'override_withdrawal_risk',
      expect.objectContaining({ p_ip: '198.51.100.1' }),
    );
  });
});

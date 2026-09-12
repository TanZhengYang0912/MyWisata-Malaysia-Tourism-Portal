import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  permissionRpc: vi.fn(),
  serviceRpc: vi.fn(),
  verifyCredential: vi.fn(),
  enqueueWithdrawalEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.permissionRpc })),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ rpc: mocks.serviceRpc })) }));
vi.mock('@/lib/wallet/moderation-credential', () => ({ verifyWalletModerationCredential: mocks.verifyCredential }));
vi.mock('@/lib/email/events', () => ({ enqueueWithdrawalEmail: mocks.enqueueWithdrawalEmail }));

import { POST } from '../route';

const actorId = '11111111-1111-4111-8111-111111111111';
const withdrawalId = '22222222-2222-4222-8222-222222222222';
const validBody = {
  reasonCategory: 'bank_details_mismatch',
  reason: 'The payout details could not be verified.',
  moderationCredential: 'signed-review-token',
  advisoryAccepted: false,
};

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/withdrawals/id/reject', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, body: JSON.stringify(body),
  });
}

describe('POST /api/admin/withdrawals/:id/reject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: actorId } }, error: null });
    mocks.permissionRpc.mockResolvedValue({ data: true, error: null });
    mocks.verifyCredential.mockReturnValue({ valid: true, claims: { verdict: 'clear' } });
    mocks.serviceRpc.mockResolvedValue({ data: { user_id: '33333333-3333-4333-8333-333333333333', amount_rm: 50 }, error: null });
  });

  it('requires a valid reason before credential verification or rejection', async () => {
    const response = await POST(request({ ...validBody, reason: 'short' }), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(422);
    expect(mocks.verifyCredential).not.toHaveBeenCalled();
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', { ...validBody, moderationCredential: undefined }],
    ['invalid', validBody],
    ['expired', validBody],
  ])('requires a fresh moderation credential when it is %s', async (_label, body) => {
    mocks.verifyCredential.mockReturnValue({ valid: false, reason: _label === 'expired' ? 'expired' : 'signature' });
    const response = await POST(request(body), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'MODERATION_REVIEW_REQUIRED' } });
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });

  it('requires explicit acknowledgement for an advisory credential', async () => {
    mocks.verifyCredential.mockReturnValue({ valid: true, claims: { verdict: 'advisory' } });
    const response = await POST(request(validBody), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'ADVISORY_ACKNOWLEDGEMENT_REQUIRED' } });
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });

  it('verifies exact claims and sends the actor plus server-observed IP to the service-only RPC', async () => {
    const response = await POST(request(validBody), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(200);
    expect(mocks.verifyCredential).toHaveBeenCalledWith('signed-review-token', {
      actorId,
      withdrawalId,
      action: 'reject',
      reasonCategory: 'bank_details_mismatch',
      reason: 'The payout details could not be verified.',
    });
    expect(mocks.serviceRpc).toHaveBeenCalledWith('reject_wallet_withdrawal_server', {
      p_actor_id: actorId,
      p_id: withdrawalId,
      p_reason: validBody.reason,
      p_ip: '203.0.113.9',
      p_reason_category: validBody.reasonCategory,
    });
    expect(mocks.permissionRpc).not.toHaveBeenCalledWith('reject_wallet_withdrawal', expect.anything());
  });

  it('allows an acknowledged advisory credential', async () => {
    mocks.verifyCredential.mockReturnValue({ valid: true, claims: { verdict: 'advisory' } });
    const response = await POST(request({ ...validBody, advisoryAccepted: true }), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(200);
    expect(mocks.serviceRpc).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the credential secret is missing or weak', async () => {
    mocks.verifyCredential.mockImplementation(() => { throw new Error('wallet_moderation_secret_invalid'); });
    const response = await POST(request(validBody), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'MODERATION_REVIEW_UNAVAILABLE' } });
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireStaffPermission: vi.fn(),
  moderateWalletAction: vi.fn(),
  signCredential: vi.fn(),
}));

vi.mock('@/lib/staff-permissions/server', () => ({ requireStaffPermission: mocks.requireStaffPermission }));
vi.mock('@/lib/wallet/moderation-guard', () => ({ moderateWalletAction: mocks.moderateWalletAction }));
vi.mock('@/lib/wallet/moderation-credential', () => ({ signWalletModerationCredential: mocks.signCredential }));

import { POST } from '../route';

const withdrawalId = '22222222-2222-4222-8222-222222222222';
const actorId = '11111111-1111-4111-8111-111111111111';
const validBody = {
  reasonCategory: 'bank_details_mismatch',
  reason: 'The payout details could not be verified.',
};

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/withdrawals/id/review-reason', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/admin/withdrawals/:id/review-reason', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffPermission.mockResolvedValue({ user: { id: actorId }, db: {}, response: null });
    mocks.moderateWalletAction.mockResolvedValue({ ok: true, categories: [], advisory: null });
    mocks.signCredential.mockReturnValue('signed-review-token');
  });

  it('checks authorization before parsing or moderation', async () => {
    mocks.requireStaffPermission.mockResolvedValue({ user: null, db: {}, response: new Response(null, { status: 403 }) });
    const response = await POST(request({}), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(403);
    expect(mocks.moderateWalletAction).not.toHaveBeenCalled();
    expect(mocks.signCredential).not.toHaveBeenCalled();
  });

  it('rejects an invalid category before Gemini', async () => {
    const response = await POST(request({ ...validBody, reasonCategory: 'not_allowed' }), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(422);
    expect(mocks.moderateWalletAction).not.toHaveBeenCalled();
    expect(mocks.signCredential).not.toHaveBeenCalled();
  });

  it('returns an advisory and a signed credential for a safe but weak reason', async () => {
    const advisory = { reasons: ['relevance', 'tone'], message: 'State the mismatch factually and use neutral language.' };
    mocks.moderateWalletAction.mockResolvedValue({ ok: true, categories: ['category_mismatch', 'tone'], advisory });
    const response = await POST(request(validBody), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { verdict: 'advisory', advisory, moderationCredential: 'signed-review-token' }, error: null });
    expect(mocks.signCredential).toHaveBeenCalledWith({ actorId, withdrawalId, action: 'reject', ...validBody, verdict: 'advisory' });
  });

  it.each([
    ['CONTENT_REJECTED', 422],
    ['MODERATION_UNAVAILABLE', 503],
    ['RATE_LIMITED', 429],
  ])('keeps %s as a hard block', async (code, status) => {
    mocks.moderateWalletAction.mockResolvedValue({ ok: false, code, message: 'blocked' });
    const response = await POST(request(validBody), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(status);
    expect(mocks.signCredential).not.toHaveBeenCalled();
  });

  it('fails closed when the review signing secret is invalid', async () => {
    mocks.signCredential.mockImplementation(() => { throw new Error('wallet_moderation_secret_invalid'); });
    const response = await POST(request(validBody), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'MODERATION_REVIEW_UNAVAILABLE' } });
  });
});

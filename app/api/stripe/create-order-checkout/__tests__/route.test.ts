import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  sessionsCreate: vi.fn(),
  resolveEffectiveCapability: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({ resolveEffectiveCapability: mocks.resolveEffectiveCapability }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  })),
}));

vi.mock('@/lib/stripe', () => ({ stripe: { checkout: { sessions: { create: mocks.sessionsCreate } } } }));

import { POST } from '../route';

function request() {
  return new Request('http://localhost/api/stripe/create-order-checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount_rm: 25 }),
  });
}

describe('POST /api/stripe/create-order-checkout phone gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.resolveEffectiveCapability.mockResolvedValue({
      capability: 'commerce.checkout', allowed: false,
      blockerCode: 'PHONE_VERIFICATION_REQUIRED',
      qualificationPaths: [{ type: 'phone', href: '/customer/phone' }],
      entitlementGeneration: 7, source: 'hard_guard',
    });
  });

  it('returns the same phone gate code before creating a Stripe session', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { tier: 'email_verified', kyc_status: 'unverified', phone_verified_at: null }, error: null });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PHONE_VERIFICATION_REQUIRED' } });
    expect(mocks.resolveEffectiveCapability).toHaveBeenCalledWith('user-1', 'commerce.checkout');
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });
});

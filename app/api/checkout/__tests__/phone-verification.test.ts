import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

vi.mock('@/backend/domains/catalogue', () => ({ getActivities: vi.fn() }));
vi.mock('@/backend/core/helpers', () => ({ cartTotals: vi.fn(), unitPrice: vi.fn() }));
vi.mock('@/lib/stripe', () => ({ stripe: { checkout: { sessions: { create: vi.fn() } } } }));

import { POST } from '../prepare/route';

function request() {
  return new Request('http://localhost/api/checkout/prepare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paymentMethod: 'stripe_card', idempotencyKey: 'checkout-test-key-123456' }),
  });
}

describe('POST /api/checkout/prepare phone gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  });

  it('blocks an unverified user before cart lookup or checkout RPC side effects', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { phone_verified_at: null }, error: null });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PHONE_VERIFICATION_REQUIRED' } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  customersCreate: vi.fn(),
  sessionsCreate: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  })),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    customers: { create: mocks.customersCreate },
    checkout: { sessions: { create: mocks.sessionsCreate } },
  },
}));

import { POST } from '../route';

function request(amountRm: number) {
  return new Request('http://localhost/api/stripe/create-checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount_rm: amountRm }),
  });
}

describe('POST /api/stripe/create-checkout amount boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@example.com' } }, error: null });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({
      data: {
        email: 'user@example.com',
        full_name: 'Test User',
        stripe_customer_id: 'cus_test',
        tier: 'kyc_verified',
        phone_verified_at: '2026-08-20T00:00:00.000Z',
      },
      error: null,
    });
    mocks.sessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
  });

  it.each([1.99, 1.999])('rejects RM%s before creating a Stripe session', async (amountRm) => {
    const response = await POST(request(amountRm));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Minimum top-up is RM 2.00' });
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it('accepts the RM2.00 boundary', async () => {
    const response = await POST(request(2));

    expect(response.status).toBe(200);
    expect(mocks.sessionsCreate).toHaveBeenCalledOnce();
    expect(mocks.sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 200 }) })],
    }));
  });

  it.each([1_000_000, 1e55])('rejects an unsupported RM%s amount before creating a Stripe session', async (amountRm) => {
    const response = await POST(request(amountRm));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Maximum top-up is RM 999,999.99' });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.customersCreate).not.toHaveBeenCalled();
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it('accepts the RM999,999.99 provider boundary as 99,999,999 sen', async () => {
    const response = await POST(request(999_999.99));

    expect(response.status).toBe(200);
    expect(mocks.sessionsCreate).toHaveBeenCalledOnce();
    expect(mocks.sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 99_999_999 }) })],
    }));
  });
});

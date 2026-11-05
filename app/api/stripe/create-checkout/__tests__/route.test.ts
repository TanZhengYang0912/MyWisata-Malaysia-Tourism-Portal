import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  resolveServerCustomerCapability: vi.fn(),
  startOrResumeWalletTopUp: vi.fn(),
  getActiveWalletTopUp: vi.fn(),
}));

vi.mock('@/lib/auth/customer-capabilities.server', () => ({
  resolveServerCustomerCapability: mocks.resolveServerCustomerCapability,
  customerCapabilityFailure: () => null,
}));
vi.mock('@/lib/wallet/topup-operations', () => ({
  startOrResumeWalletTopUp: mocks.startOrResumeWalletTopUp,
  getActiveWalletTopUp: mocks.getActiveWalletTopUp,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })),
}));

import { POST } from '../route';

function request(amountRm: number) {
  return new Request('http://localhost/api/stripe/create-checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount_rm: amountRm, operation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
  });
}

describe('POST /api/stripe/create-checkout amount boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@example.com' } }, error: null });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: { email: 'user@example.com', full_name: 'Test User' }, error: null });
    mocks.startOrResumeWalletTopUp.mockResolvedValue({ state: 'open', operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', amountSen: 200, checkoutUrl: 'https://checkout.stripe.test/session' });
    mocks.resolveServerCustomerCapability.mockResolvedValue({ allowed: true });
  });

  it.each([1.99, 1.999])('rejects RM%s before preparing a top-up operation', async (amountRm) => {
    const response = await POST(request(amountRm));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Minimum top-up is RM2.00' });
    expect(mocks.startOrResumeWalletTopUp).not.toHaveBeenCalled();
  });

  it('accepts the RM2.00 boundary as 200 sen', async () => {
    const response = await POST(request(2));
    expect(response.status).toBe(200);
    expect(mocks.startOrResumeWalletTopUp).toHaveBeenCalledOnce();
    expect(mocks.startOrResumeWalletTopUp).toHaveBeenCalledWith(expect.objectContaining({ amountSen: 200 }));
  });

  it.each([1_000_000, 1e55])('rejects unsupported RM%s before preparing an operation', async (amountRm) => {
    const response = await POST(request(amountRm));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Maximum top-up is RM999,999.99' });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.startOrResumeWalletTopUp).not.toHaveBeenCalled();
  });

  it('accepts the RM999,999.99 boundary as 99,999,999 sen', async () => {
    const response = await POST(request(999_999.99));
    expect(response.status).toBe(200);
    expect(mocks.startOrResumeWalletTopUp).toHaveBeenCalledOnce();
    expect(mocks.startOrResumeWalletTopUp).toHaveBeenCalledWith(expect.objectContaining({ amountSen: 99_999_999 }));
  });
});

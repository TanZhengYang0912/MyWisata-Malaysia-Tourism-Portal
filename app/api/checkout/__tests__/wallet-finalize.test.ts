import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const getUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    rpc,
  })),
}));

import { POST } from '../finalize/route';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/checkout/finalize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/checkout/finalize wallet settlement errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null });
  });

  it('exposes a stable insufficient-wallet code without creating a partial debit', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'wallet_insufficient' } });

    const response = await POST(request({
      checkoutSessionId: '22222222-2222-4222-8222-222222222222',
      outcome: 'succeeded',
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { code: 'WALLET_INSUFFICIENT', message: 'Wallet balance is no longer sufficient. Top up your Wallet or pay by card.' },
    });
    expect(rpc).toHaveBeenCalledWith('finalize_customer_wallet_checkout', expect.objectContaining({
      p_checkout_session_id: '22222222-2222-4222-8222-222222222222',
    }));
  });
});

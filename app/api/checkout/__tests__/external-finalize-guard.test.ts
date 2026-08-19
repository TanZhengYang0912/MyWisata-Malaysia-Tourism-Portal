import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
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

describe('POST /api/checkout/finalize external confirmation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
      error: null,
    });
  });

  it('rejects caller-supplied provider payment and event identifiers', async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: 'paid' },
      error: null,
    });

    const response = await POST(request({
      checkoutSessionId: '22222222-2222-4222-8222-222222222222',
      outcome: 'succeeded',
      providerPaymentId: 'pi_attacker_supplied',
      providerEventId: 'evt_attacker_supplied',
    }));

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns a stable forbidden error when the database rejects external confirmation', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'provider_confirmation_required' } });

    const response = await POST(request({
      checkoutSessionId: '22222222-2222-4222-8222-222222222222',
      outcome: 'succeeded',
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: {
        code: 'PROVIDER_CONFIRMATION_REQUIRED',
        message: 'External payments must be confirmed by the payment provider.',
      },
    });
  });
});

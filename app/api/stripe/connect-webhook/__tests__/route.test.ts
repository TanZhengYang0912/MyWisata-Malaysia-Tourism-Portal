import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  rpc: vi.fn(),
  get: vi.fn(),
  enqueueWithdrawalEmail: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: mocks.constructEvent } },
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: mocks.get,
    rpc: mocks.rpc,
  })),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));
vi.mock('@/lib/email/events', () => ({ enqueueWithdrawalEmail: mocks.enqueueWithdrawalEmail }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'stripe-signature': 'sig_test' })),
}));

import { POST } from '../route';

function request() {
  return new Request('http://localhost/api/stripe/connect-webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_test' },
    body: '{}',
  });
}

describe('POST /api/stripe/connect-webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';
    mocks.constructEvent.mockReturnValue({
      type: 'payout.paid',
      data: { object: { id: 'po_test' } },
    });
    mocks.rpc.mockResolvedValue({ data: { status: 'paid' }, error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'w_test', user_id: 'u_test', amount: 100 }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    mocks.get.mockReturnValue({ select: vi.fn(() => ({ eq })) });
  });

  it('settles paid payouts through the guarded completion RPC', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('complete_withdrawal_payout', {
      p_withdrawal_id: 'w_test',
      p_payout_id: 'po_test',
      p_status: 'paid',
    });
  });

  it('settles failed payouts through the guarded completion RPC', async () => {
    mocks.constructEvent.mockReturnValue({
      type: 'payout.failed',
      data: { object: { id: 'po_test' } },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('complete_withdrawal_payout', {
      p_withdrawal_id: 'w_test',
      p_payout_id: 'po_test',
      p_status: 'failed',
    });
  });
});

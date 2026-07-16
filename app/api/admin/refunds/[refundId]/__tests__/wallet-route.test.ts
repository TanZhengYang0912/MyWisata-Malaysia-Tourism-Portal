import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rolesSelect: vi.fn(),
  rpc: vi.fn(),
  refundMaybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => mocks.rolesSelect() }) }),
    rpc: mocks.rpc,
  })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.refundMaybeSingle }) }),
    }),
  })),
}));

import { POST } from '../route';

function request() {
  return new Request('http://localhost/api/admin/refunds/refund-id', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'approve' }),
  });
}

describe('POST /api/admin/refunds/:refundId Wallet refund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null });
    mocks.rolesSelect.mockResolvedValue({ data: [{ roles: { name: 'super_admin' } }] });
    mocks.refundMaybeSingle.mockResolvedValue({
      data: {
        id: '33333333-3333-4333-8333-333333333333',
        order_id: '44444444-4444-4444-8444-444444444444',
        payment_id: '55555555-5555-4555-8555-555555555555',
        amount: 50,
        status: 'pending',
        payments: { method: 'wallet', provider: 'platform', provider_payment_id: null },
      },
    });
  });

  it('uses the atomic Wallet refund RPC instead of a direct balance write', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'processed' }, error: null });

    const response = await POST(request(), { params: Promise.resolve({ refundId: '33333333-3333-4333-8333-333333333333' }) });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('process_wallet_refund', {
      p_refund_id: '33333333-3333-4333-8333-333333333333',
      p_note: null,
    });
  });
});

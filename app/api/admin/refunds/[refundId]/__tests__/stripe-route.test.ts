import { beforeEach, describe, expect, it, vi } from 'vitest';

const REFUND_ID = '33333333-3333-4333-8333-333333333333';
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rolesSelect: vi.fn(),
  serviceFrom: vi.fn(),
  retrieveSession: vi.fn(),
  createRefund: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => mocks.rolesSelect() }) }),
    rpc: vi.fn(),
  })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })),
}));
vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { retrieve: mocks.retrieveSession } },
    refunds: { create: mocks.createRefund },
  },
}));

import { POST } from '../route';

function queryResult(data: unknown) {
  const terminal = Promise.resolve({ data, error: null });
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'update']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal);
  return builder;
}

describe('POST /api/admin/refunds/:refundId Stripe refund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null });
    mocks.rolesSelect.mockResolvedValue({ data: [{ roles: { name: 'approver' } }] });
    mocks.serviceFrom.mockImplementation((table: string) => queryResult(table === 'refunds' ? {
      id: REFUND_ID,
      order_id: '44444444-4444-4444-8444-444444444444',
      payment_id: '55555555-5555-4555-8555-555555555555',
      amount: 50,
      status: 'pending',
      payments: { method: 'stripe_card', provider: 'stripe', provider_payment_id: 'cs_test_session_001' },
    } : null));
    mocks.retrieveSession.mockResolvedValue({ payment_intent: { id: 'pi_test_001' } });
    mocks.createRefund.mockResolvedValue({ id: 're_test_001' });
  });

  it('uses a deterministic Stripe idempotency key tied to the refund request', async () => {
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    }), { params: Promise.resolve({ refundId: REFUND_ID }) });

    expect(response.status).toBe(200);
    expect(mocks.createRefund).toHaveBeenCalledWith(
      { payment_intent: 'pi_test_001', amount: 5000 },
      { idempotencyKey: `refund:${REFUND_ID}` },
    );
  });
});

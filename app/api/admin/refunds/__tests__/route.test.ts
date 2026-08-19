import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '7df122f8-afae-4249-8504-bdd465a78f31';
const REFUND_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), authFrom: vi.fn(), serviceFrom: vi.fn() }));

function queryResult(data: unknown, error: unknown = null) {
  const terminal = Promise.resolve({ data, error });
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) builder[method] = vi.fn(() => builder);
  builder.then = terminal.then.bind(terminal);
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.authFrom })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })),
}));

import { GET } from '../route';

describe('GET /api/admin/refunds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.authFrom.mockReturnValue(queryResult([{ roles: { name: 'super_admin' } }]));
    mocks.serviceFrom.mockReturnValue(queryResult([{
      id: REFUND_ID,
      order_id: '1d4057cf-c821-4b05-a454-61dbdc42d32c',
      amount: 50,
      reason: 'Customer request',
      status: 'approved',
      provider_refund_id: 'sim_refund_0123456789abcdef0123456789abcdef01234567',
      provider_failure_code: null,
      provider_failure_message: null,
      attempt_count: 1,
      created_at: '2026-08-17T00:00:00.000Z',
      updated_at: '2026-08-17T00:01:00.000Z',
      payments: { method: 'ewallet', provider: 'tng_ewallet_simulator' },
      orders: { order_number: 'MW-1001' },
    }]));
  });

  it('returns a bounded admin-safe refund projection', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.refunds[0]).toEqual({
      id: REFUND_ID,
      orderId: '1d4057cf-c821-4b05-a454-61dbdc42d32c',
      orderNumber: 'MW-1001',
      amountRm: 50,
      reason: 'Customer request',
      status: 'approved',
      provider: 'tng_ewallet_simulator',
      method: 'ewallet',
      providerRefundId: 'sim_refund_0123456789abcdef0123456789abcdef01234567',
      failureCode: null,
      failureMessage: null,
      attemptCount: 1,
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:01:00.000Z',
    });
    expect(JSON.stringify(body)).not.toContain('provider_payment_id');
  });

  it('rejects non-admin users before using the service client', async () => {
    mocks.authFrom.mockReturnValue(queryResult([]));
    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });
});

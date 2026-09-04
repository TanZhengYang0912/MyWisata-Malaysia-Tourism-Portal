import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REFUND_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rolesSelect: vi.fn(),
  refundMaybeSingle: vi.fn(),
  serviceRpc: vi.fn(),
  serviceFrom: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => mocks.rolesSelect() }) }),
    rpc: vi.fn(),
  })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: mocks.serviceFrom,
    rpc: mocks.serviceRpc,
  })),
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

function request() {
  return new Request(`http://localhost/api/admin/refunds/${REFUND_ID}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'approve', note: 'Provider simulator test approval' }),
  });
}

describe('POST /api/admin/refunds/:refundId simulated provider refund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMENT_SIMULATOR_MODE', 'enabled');
    vi.stubEnv('PAYMENT_SIMULATOR_WEBHOOK_SECRET', 'refund-route-test-secret');
    mocks.getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null });
    mocks.rolesSelect.mockResolvedValue({ data: [{ roles: { name: 'super_admin' } }] });
    mocks.serviceFrom.mockReturnValue(queryResult({
      id: REFUND_ID,
      order_id: '44444444-4444-4444-8444-444444444444',
      payment_id: '55555555-5555-4555-8555-555555555555',
      amount: 50,
      status: 'pending',
      payments: {
        method: 'ewallet',
        provider: 'tng_ewallet_simulator',
        provider_payment_id: 'sim_pay_0123456789abcdef0123456789abcdef01234567',
      },
    }));
    mocks.serviceRpc.mockResolvedValue({ data: { refund_id: REFUND_ID, status: 'approved' }, error: null });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('starts an opaque asynchronous refund without marking it processed', async () => {
    const response = await POST(request(), { params: Promise.resolve({ refundId: REFUND_ID }) });

    expect(response.status).toBe(200);
    expect(mocks.serviceRpc).toHaveBeenCalledWith('begin_simulated_refund', {
      p_refund_id: REFUND_ID,
      p_provider: 'tng_ewallet_simulator',
      p_provider_refund_id: expect.stringMatching(/^sim_refund_[0-9a-f]{40}$/),
    });
    await expect(response.json()).resolves.toMatchObject({ data: { status: 'approved' } });
  });

  it('fails closed when simulator refunds are unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await POST(request(), { params: Promise.resolve({ refundId: REFUND_ID }) });

    expect(response.status).toBe(503);
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });
});

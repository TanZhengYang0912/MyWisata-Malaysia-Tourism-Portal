import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifySimulatorWebhookSignature } from '@/lib/payments/simulator-webhook';

const REFUND_ID = '33333333-3333-4333-8333-333333333333';
const ORDER_ID = '1d4057cf-c821-4b05-a454-61dbdc42d32c';
const USER_ID = '7df122f8-afae-4249-8504-bdd465a78f31';
const secret = 'simulator-refund-action-secret';
let attemptCount = 1;

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  authFrom: vi.fn(),
  serviceFrom: vi.fn(),
  settleSimulatorEvent: vi.fn(),
}));

function queryResult(data: unknown, error: unknown = null) {
  const terminal = Promise.resolve({ data, error });
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal);
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.authFrom })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })),
}));
vi.mock('@/lib/payments/settle-simulator-event', () => ({ settleSimulatorEvent: mocks.settleSimulatorEvent }));

import { POST } from '../route';

function request(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/payments/simulator/refunds/${REFUND_ID}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST simulator refund action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attemptCount = 1;
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMENT_SIMULATOR_MODE', 'enabled');
    vi.stubEnv('PAYMENT_SIMULATOR_WEBHOOK_SECRET', secret);
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.authFrom.mockReturnValue(queryResult([{ roles: { name: 'super_admin' } }]));
    mocks.serviceFrom.mockReturnValue(queryResult({
      id: REFUND_ID,
      order_id: ORDER_ID,
      amount: 50,
      status: 'approved',
      attempt_count: attemptCount,
      provider_refund_id: 'sim_refund_0123456789abcdef0123456789abcdef01234567',
      payments: { provider: 'grabpay_simulator' },
    }));
    mocks.settleSimulatorEvent.mockResolvedValue({
      kind: 'refund', status: 'processed', idempotent: false, orderId: ORDER_ID,
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('constructs a signed refund event from server-owned data', async () => {
    const response = await POST(request({ outcome: 'succeeded' }), {
      params: Promise.resolve({ refundId: REFUND_ID }),
    });

    expect(response.status).toBe(200);
    const [rawBody, signature] = mocks.settleSimulatorEvent.mock.calls[0] as [string, string];
    expect(verifySimulatorWebhookSignature(rawBody, signature, secret)).toBe(true);
    expect(JSON.parse(rawBody)).toEqual({
      kind: 'refund',
      eventId: expect.stringMatching(/^sim_evt_[0-9a-f]{40}$/),
      provider: 'grabpay_simulator',
      providerRefundId: 'sim_refund_0123456789abcdef0123456789abcdef01234567',
      refundId: REFUND_ID,
      eventType: 'refund.succeeded',
      amountSen: 5000,
      currency: 'MYR',
    });
    expect(JSON.stringify(await response.json())).not.toContain(secret);
  });

  it('rejects caller-supplied amount and provider references', async () => {
    const response = await POST(request({ outcome: 'succeeded', amountSen: 1 }), {
      params: Promise.resolve({ refundId: REFUND_ID }),
    });

    expect(response.status).toBe(422);
    expect(mocks.settleSimulatorEvent).not.toHaveBeenCalled();
  });

  it('uses a new event namespace for each approved refund attempt', async () => {
    await POST(request({ outcome: 'failed' }), {
      params: Promise.resolve({ refundId: REFUND_ID }),
    });
    const [firstBody] = mocks.settleSimulatorEvent.mock.calls[0] as [string, string];

    attemptCount = 2;
    mocks.serviceFrom.mockReturnValue(queryResult({
      id: REFUND_ID,
      order_id: ORDER_ID,
      amount: 50,
      status: 'approved',
      attempt_count: attemptCount,
      provider_refund_id: 'sim_refund_0123456789abcdef0123456789abcdef01234567',
      payments: { provider: 'grabpay_simulator' },
    }));
    await POST(request({ outcome: 'failed' }), {
      params: Promise.resolve({ refundId: REFUND_ID }),
    });
    const [secondBody] = mocks.settleSimulatorEvent.mock.calls[1] as [string, string];

    expect(JSON.parse(secondBody).eventId).not.toBe(JSON.parse(firstBody).eventId);
  });

  it('requires a Super Admin role', async () => {
    mocks.authFrom.mockReturnValue(queryResult([]));
    const response = await POST(request({ outcome: 'failed' }), {
      params: Promise.resolve({ refundId: REFUND_ID }),
    });

    expect(response.status).toBe(403);
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });

  it('fails closed in Production before authentication', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await POST(request({ outcome: 'succeeded' }), {
      params: Promise.resolve({ refundId: REFUND_ID }),
    });

    expect(response.status).toBe(404);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

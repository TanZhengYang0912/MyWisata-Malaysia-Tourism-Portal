import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifySimulatorWebhookSignature } from '@/lib/payments/simulator-webhook';

const SESSION_ID = '9e703f42-7f40-4a4f-a4a0-447eb6319931';
const ORDER_ID = '1d4057cf-c821-4b05-a454-61dbdc42d32c';
const USER_ID = '7df122f8-afae-4249-8504-bdd465a78f31';
const secret = 'simulator-action-route-secret';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  serviceFrom: vi.fn(),
  settleSimulatorEvent: vi.fn(),
}));

function queryResult(data: unknown, error: unknown = null) {
  const terminal = Promise.resolve({ data, error });
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal);
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })) }));
vi.mock('@/lib/payments/settle-simulator-event', () => ({ settleSimulatorEvent: mocks.settleSimulatorEvent }));

import { POST } from '../route';

function request(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/payments/simulator/sessions/${SESSION_ID}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST simulator checkout action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMENT_SIMULATOR_MODE', 'enabled');
    vi.stubEnv('PAYMENT_SIMULATOR_WEBHOOK_SECRET', secret);
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.from.mockReturnValue(queryResult({
      id: SESSION_ID,
      user_id: USER_ID,
      order_id: ORDER_ID,
      status: 'requires_action',
      currency: 'MYR',
      expires_at: '2099-08-17T11:00:00.000Z',
    }));
    mocks.serviceFrom.mockReturnValue(queryResult({
      method: 'ewallet',
      provider: 'grabpay_simulator',
      provider_payment_id: 'sim_pay_0123456789abcdef0123456789abcdef01234567',
      amount: 50,
      status: 'requires_action',
    }));
    mocks.settleSimulatorEvent.mockResolvedValue({
      kind: 'payment',
      status: 'paid',
      idempotent: false,
      orderId: ORDER_ID,
      checkoutSessionId: SESSION_ID,
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('constructs and signs the event entirely from owned server data', async () => {
    const response = await POST(request({ outcome: 'succeeded' }), {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.settleSimulatorEvent).toHaveBeenCalledTimes(1);
    const [rawBody, signature] = mocks.settleSimulatorEvent.mock.calls[0] as [string, string];
    expect(verifySimulatorWebhookSignature(rawBody, signature, secret)).toBe(true);
    expect(JSON.parse(rawBody)).toEqual({
      kind: 'payment',
      eventId: expect.stringMatching(/^sim_evt_[0-9a-f]{40}$/),
      provider: 'grabpay_simulator',
      providerPaymentId: 'sim_pay_0123456789abcdef0123456789abcdef01234567',
      checkoutSessionId: SESSION_ID,
      eventType: 'payment.succeeded',
      amountSen: 5000,
      currency: 'MYR',
    });
    expect(JSON.stringify(await response.json())).not.toContain(secret);
  });

  it('rejects caller-supplied provider references through a strict schema', async () => {
    const response = await POST(request({
      outcome: 'succeeded',
      providerPaymentId: 'sim_pay_attacker',
    }), { params: Promise.resolve({ sessionId: SESSION_ID }) });

    expect(response.status).toBe(422);
    expect(mocks.settleSimulatorEvent).not.toHaveBeenCalled();
  });

  it('turns a success request for an expired session into an expired provider event', async () => {
    mocks.from.mockReturnValue(queryResult({
      id: SESSION_ID,
      user_id: USER_ID,
      order_id: ORDER_ID,
      status: 'requires_action',
      currency: 'MYR',
      expires_at: '2020-01-01T00:00:00.000Z',
    }));

    const response = await POST(request({ outcome: 'succeeded' }), {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });

    expect(response.status).toBe(200);
    const [rawBody] = mocks.settleSimulatorEvent.mock.calls[0] as [string, string];
    expect(JSON.parse(rawBody).eventType).toBe('payment.expired');
  });

  it('fails closed in Production before authentication', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await POST(request({ outcome: 'succeeded' }), {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });

    expect(response.status).toBe(404);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

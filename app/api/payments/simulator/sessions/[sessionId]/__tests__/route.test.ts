import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_ID = '9e703f42-7f40-4a4f-a4a0-447eb6319931';
const ORDER_ID = '1d4057cf-c821-4b05-a454-61dbdc42d32c';
const USER_ID = '7df122f8-afae-4249-8504-bdd465a78f31';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  serviceFrom: vi.fn(),
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
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })),
}));

import { GET } from '../route';

describe('GET simulator checkout session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMENT_SIMULATOR_MODE', 'enabled');
    vi.stubEnv('PAYMENT_SIMULATOR_WEBHOOK_SECRET', 'session-route-secret');
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.from.mockReturnValue(queryResult({
      id: SESSION_ID,
      user_id: USER_ID,
      order_id: ORDER_ID,
      status: 'requires_action',
      currency: 'MYR',
      expires_at: '2026-08-17T11:00:00.000Z',
    }));
    mocks.serviceFrom.mockReturnValue(queryResult({
      method: 'ewallet',
      provider: 'tng_ewallet_simulator',
      provider_payment_id: 'sim_pay_0123456789abcdef0123456789abcdef01234567',
      amount: 50,
      status: 'requires_action',
    }));
  });

  afterEach(() => vi.unstubAllEnvs());

  it('returns only the safe owned simulator projection', async () => {
    const response = await GET(new Request(`http://localhost/api/payments/simulator/sessions/${SESSION_ID}`), {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      sessionId: SESSION_ID,
      orderId: ORDER_ID,
      provider: 'tng_ewallet_simulator',
      providerPaymentId: 'sim_pay_0123456789abcdef0123456789abcdef01234567',
      amountSen: 5000,
      currency: 'MYR',
      status: 'requires_action',
      expiresAt: '2026-08-17T11:00:00.000Z',
      simulated: true,
    });
    expect(JSON.stringify(body)).not.toContain('session-route-secret');
    expect(JSON.stringify(body)).not.toContain(USER_ID);
  });

  it('rejects unauthenticated access before reading payment data', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ sessionId: SESSION_ID }) });

    expect(response.status).toBe(401);
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });

  it('fails closed in Production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ sessionId: SESSION_ID }) });

    expect(response.status).toBe(404);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

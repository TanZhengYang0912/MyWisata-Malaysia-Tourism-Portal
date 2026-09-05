import { beforeEach, describe, expect, it, vi } from 'vitest';

const CHECKOUT_ONE = '11111111-1111-4111-8111-111111111111';
const CHECKOUT_TWO = '22222222-2222-4222-8222-222222222222';
const CHECKOUT_THREE = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  getEvidence: vi.fn(),
  enqueueEmail: vi.fn(),
  emitVendorEvent: vi.fn(),
  paymentsQuery: null as Record<string, ReturnType<typeof vi.fn>> | null,
  sessionsQuery: null as Record<string, ReturnType<typeof vi.fn>> | null,
}));

function queryResult(data: unknown) {
  const terminal = Promise.resolve({ data, error: null });
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'not', 'in', 'lt', 'order', 'limit']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return builder;
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.from, rpc: mocks.rpc })),
}));
vi.mock('@/lib/payments/toyyibpay', () => ({
  ToyyibPayProvider: class {
    isConfigured() { return true; }
    getPaymentEvidence(billCode: string) { return mocks.getEvidence(billCode); }
  },
}));
vi.mock('@/lib/email/events', () => ({ enqueueUserTransactionEmail: mocks.enqueueEmail }));
vi.mock('@/lib/vendor-notifications/order-events', () => ({ emitOrderVendorEvent: mocks.emitVendorEvent }));

import { GET } from '../route';

function request(secret = 'cron-test-secret') {
  return new Request('https://mywisata.example/api/cron/reconcile-toyyibpay-checkouts', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

function payment(orderId: string, billCode: string) {
  return {
    order_id: orderId,
    provider_payment_id: billCode,
    amount: 50,
    status: 'requires_action',
    updated_at: '2026-09-05T00:00:00.000Z',
  };
}

function checkout(id: string, orderId: string) {
  return {
    id,
    order_id: orderId,
    user_id: '99999999-9999-4999-8999-999999999999',
    currency: 'MYR',
    total_amount: 50,
    status: 'requires_action',
    payment_method: 'bank_transfer',
  };
}

describe('GET /api/cron/reconcile-toyyibpay-checkouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-test-secret');
    const payments = [
      payment('order-1', 'A1b2C3d4'),
      payment('order-2', 'E5f6G7h8'),
      payment('order-3', 'I9j0K1l2'),
    ];
    const sessions = [
      checkout(CHECKOUT_ONE, 'order-1'),
      checkout(CHECKOUT_TWO, 'order-2'),
      checkout(CHECKOUT_THREE, 'order-3'),
    ];
    mocks.paymentsQuery = queryResult(payments);
    mocks.sessionsQuery = queryResult(sessions);
    mocks.from.mockImplementation((table: string) => {
      if (table === 'payments') return mocks.paymentsQuery;
      if (table === 'checkout_sessions') return mocks.sessionsQuery;
      throw new Error(`unexpected table ${table}`);
    });
    mocks.getEvidence
      .mockResolvedValueOnce({ status: 'succeeded', rawStatus: '1', amountSen: 5000, providerEventReference: 'TP1', externalReference: CHECKOUT_ONE })
      .mockResolvedValueOnce({ status: 'pending', rawStatus: '4', amountSen: 5000, providerEventReference: 'TP2', externalReference: CHECKOUT_TWO })
      .mockResolvedValueOnce({ status: 'failed', rawStatus: '3', amountSen: 5000, providerEventReference: 'TP3', externalReference: CHECKOUT_THREE });
    mocks.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => ({
      data: {
        checkout_session_id: args.p_checkout_session_id,
        order_id: args.p_checkout_session_id === CHECKOUT_ONE ? 'order-1' : args.p_checkout_session_id === CHECKOUT_TWO ? 'order-2' : 'order-3',
        user_id: '99999999-9999-4999-8999-999999999999',
        status: args.p_outcome === 'succeeded' ? 'paid' : args.p_outcome === 'pending' ? 'requires_action' : 'failed',
        idempotent: false,
      },
      error: null,
    }));
    mocks.enqueueEmail.mockResolvedValue(undefined);
    mocks.emitVendorEvent.mockResolvedValue(undefined);
  });

  it('rejects missing and wrong cron secrets before service work', async () => {
    expect((await GET(new Request('https://mywisata.example/api/cron/reconcile-toyyibpay-checkouts'))).status).toBe(401);
    expect((await GET(request('wrong'))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('queries only old pending ToyyibPay bills and caps work at 50', async () => {
    mocks.paymentsQuery = queryResult([]);
    mocks.from.mockImplementation((table: string) => table === 'payments' ? mocks.paymentsQuery : mocks.sessionsQuery);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.paymentsQuery?.eq).toHaveBeenCalledWith('provider', 'toyyibpay');
    expect(mocks.paymentsQuery?.eq).toHaveBeenCalledWith('provider_create_status', 'created');
    expect(mocks.paymentsQuery?.in).toHaveBeenCalledWith('status', ['pending', 'requires_action']);
    expect(mocks.paymentsQuery?.not).toHaveBeenCalledWith('provider_payment_id', 'is', null);
    expect(mocks.paymentsQuery?.lt).toHaveBeenCalledWith('updated_at', expect.any(String));
    expect(mocks.paymentsQuery?.limit).toHaveBeenCalledWith(50);
    expect(mocks.getEvidence).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ examined: 0, settled: 0, pending: 0, failed: 0, skipped: 0, errors: 0 });
  });

  it('maps provider success, pending and failure through status-qualified settlement evidence', async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ examined: 3, settled: 1, pending: 1, failed: 1, skipped: 0, errors: 0 });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'settle_provider_checkout', expect.objectContaining({
      p_checkout_session_id: CHECKOUT_ONE, p_outcome: 'succeeded', p_provider_event_id: 'reconcile:TP1:1',
    }));
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'settle_provider_checkout', expect.objectContaining({
      p_checkout_session_id: CHECKOUT_TWO, p_outcome: 'pending', p_provider_event_id: 'reconcile:TP2:4',
    }));
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, 'settle_provider_checkout', expect.objectContaining({
      p_checkout_session_id: CHECKOUT_THREE, p_outcome: 'failed', p_provider_event_id: 'reconcile:TP3:3',
    }));
    expect(mocks.enqueueEmail).toHaveBeenCalledOnce();
    expect(mocks.emitVendorEvent).toHaveBeenCalledOnce();
    expect(JSON.stringify(body)).not.toMatch(/order-|TP[123]|A1b2|99999999/);
  });

  it('fails closed when provider external reference or amount does not match', async () => {
    mocks.paymentsQuery = queryResult([payment('order-1', 'A1b2C3d4'), payment('order-2', 'E5f6G7h8')]);
    mocks.sessionsQuery = queryResult([checkout(CHECKOUT_ONE, 'order-1'), checkout(CHECKOUT_TWO, 'order-2')]);
    mocks.from.mockImplementation((table: string) => table === 'payments' ? mocks.paymentsQuery : mocks.sessionsQuery);
    mocks.getEvidence.mockReset()
      .mockResolvedValueOnce({ status: 'succeeded', rawStatus: '1', amountSen: 5000, providerEventReference: 'TP1', externalReference: CHECKOUT_TWO })
      .mockResolvedValueOnce({ status: 'succeeded', rawStatus: '1', amountSen: 4999, providerEventReference: 'TP2', externalReference: CHECKOUT_TWO });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ examined: 2, settled: 0, pending: 0, failed: 0, skipped: 2, errors: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not duplicate notifications when settlement is already idempotent', async () => {
    mocks.paymentsQuery = queryResult([payment('order-1', 'A1b2C3d4')]);
    mocks.sessionsQuery = queryResult([checkout(CHECKOUT_ONE, 'order-1')]);
    mocks.from.mockImplementation((table: string) => table === 'payments' ? mocks.paymentsQuery : mocks.sessionsQuery);
    mocks.getEvidence.mockReset().mockResolvedValue({ status: 'succeeded', rawStatus: '1', amountSen: 5000, providerEventReference: 'TP1', externalReference: CHECKOUT_ONE });
    mocks.rpc.mockResolvedValue({
      data: { checkout_session_id: CHECKOUT_ONE, order_id: 'order-1', user_id: 'user-1', status: 'paid', idempotent: true },
      error: null,
    });

    expect((await GET(request())).status).toBe(200);
    expect((await GET(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueEmail).not.toHaveBeenCalled();
    expect(mocks.emitVendorEvent).not.toHaveBeenCalled();
  });
});

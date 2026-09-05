import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CHECKOUT_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const BILL_CODE = 'A1b2C3d4';
const SECRET = 'callback-test-secret';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  enqueueEmail: vi.fn(),
  emitVendorEvent: vi.fn(),
}));

function queryResult(data: unknown, error: unknown = null) {
  const terminal = Promise.resolve({ data, error });
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal);
  return builder;
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.from, rpc: mocks.rpc })),
}));
vi.mock('@/lib/email/events', () => ({ enqueueUserTransactionEmail: mocks.enqueueEmail }));
vi.mock('@/lib/vendor-notifications/order-events', () => ({ emitOrderVendorEvent: mocks.emitVendorEvent }));

import { POST } from '../route';

function callbackRequest(overrides: Record<string, string> = {}) {
  const fields = {
    refno: 'TP24000001',
    status: '1',
    reason: 'Approved',
    billcode: BILL_CODE,
    order_id: CHECKOUT_ID,
    amount: '50.00',
    transaction_time: '2026-09-05 12:00:00',
    ...overrides,
  };
  const hash = createHash('md5')
    .update(`${SECRET}${fields.status}${fields.order_id}${fields.refno}ok`)
    .digest('hex');
  return new Request('https://mywisata.example/api/payments/toyyibpay/callback?return=untrusted', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...fields, hash: overrides.hash ?? hash }),
  });
}

describe('POST /api/payments/toyyibpay/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TOYYIBPAY_USER_SECRET_KEY', SECRET);
    mocks.from.mockImplementation((table: string) => {
      if (table === 'checkout_sessions') return queryResult({
        id: CHECKOUT_ID, order_id: ORDER_ID, user_id: USER_ID,
        currency: 'MYR', total_amount: 50, status: 'requires_action', payment_method: 'bank_transfer',
      });
      if (table === 'payments') return queryResult({
        provider: 'toyyibpay', provider_payment_id: BILL_CODE, amount: 50,
      });
      throw new Error(`unexpected table ${table}`);
    });
    mocks.rpc.mockResolvedValue({
      data: {
        checkout_session_id: CHECKOUT_ID, order_id: ORDER_ID, user_id: USER_ID,
        status: 'paid', idempotent: false,
      },
      error: null,
    });
    mocks.enqueueEmail.mockResolvedValue(undefined);
    mocks.emitVendorEvent.mockResolvedValue(undefined);
  });

  it('rejects an invalid hash before any database lookup', async () => {
    const response = await POST(callbackRequest({ hash: '00000000000000000000000000000000' }));
    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects an unknown checkout and stored BillCode or amount mismatches', async () => {
    mocks.from.mockImplementationOnce(() => queryResult(null));
    expect((await POST(callbackRequest())).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.from.mockImplementation((table: string) => table === 'checkout_sessions'
      ? queryResult({ id: CHECKOUT_ID, order_id: ORDER_ID, user_id: USER_ID, currency: 'MYR', total_amount: 50, status: 'requires_action', payment_method: 'bank_transfer' })
      : queryResult({ provider: 'toyyibpay', provider_payment_id: 'Z9y8X7w6', amount: 50 }));
    expect((await POST(callbackRequest())).status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.from.mockImplementation((table: string) => table === 'checkout_sessions'
      ? queryResult({ id: CHECKOUT_ID, order_id: ORDER_ID, user_id: USER_ID, currency: 'MYR', total_amount: 50, status: 'requires_action', payment_method: 'bank_transfer' })
      : queryResult({ provider: 'toyyibpay', provider_payment_id: BILL_CODE, amount: 50 }));
    expect((await POST(callbackRequest({ amount: '49.99' }))).status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('settles success using status-qualified provider evidence and emits paid notifications once', async () => {
    const response = await POST(callbackRequest());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('settle_provider_checkout', expect.objectContaining({
      p_checkout_session_id: CHECKOUT_ID,
      p_provider: 'toyyibpay',
      p_outcome: 'succeeded',
      p_provider_payment_id: BILL_CODE,
      p_provider_event_id: 'TP24000001:1',
      p_amount_sen: 5000,
      p_currency: 'MYR',
      p_payload_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(mocks.enqueueEmail).toHaveBeenCalledOnce();
    expect(mocks.emitVendorEvent).toHaveBeenCalledOnce();
  });

  it('records pending without final notifications, then accepts success for the same refno', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: { checkout_session_id: CHECKOUT_ID, order_id: ORDER_ID, user_id: USER_ID, status: 'requires_action', idempotent: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { checkout_session_id: CHECKOUT_ID, order_id: ORDER_ID, user_id: USER_ID, status: 'paid', idempotent: false },
        error: null,
      });

    expect((await POST(callbackRequest({ status: '2' }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'settle_provider_checkout', expect.objectContaining({
      p_outcome: 'pending', p_provider_event_id: 'TP24000001:2',
    }));
    expect(mocks.enqueueEmail).not.toHaveBeenCalled();
    expect(mocks.emitVendorEvent).not.toHaveBeenCalled();

    expect((await POST(callbackRequest({ status: '1' }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'settle_provider_checkout', expect.objectContaining({
      p_outcome: 'succeeded', p_provider_event_id: 'TP24000001:1',
    }));
    expect(mocks.enqueueEmail).toHaveBeenCalledOnce();
    expect(mocks.emitVendorEvent).toHaveBeenCalledOnce();
  });

  it('maps provider failure without paid notifications', async () => {
    mocks.rpc.mockResolvedValue({
      data: { checkout_session_id: CHECKOUT_ID, order_id: ORDER_ID, user_id: USER_ID, status: 'failed', idempotent: false },
      error: null,
    });

    expect((await POST(callbackRequest({ status: '3' }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('settle_provider_checkout', expect.objectContaining({
      p_outcome: 'failed', p_provider_event_id: 'TP24000001:3',
    }));
    expect(mocks.enqueueEmail).not.toHaveBeenCalled();
    expect(mocks.emitVendorEvent).not.toHaveBeenCalled();
  });

  it('suppresses notifications for an idempotent duplicate event', async () => {
    mocks.rpc.mockResolvedValue({
      data: { checkout_session_id: CHECKOUT_ID, order_id: ORDER_ID, user_id: USER_ID, status: 'paid', idempotent: true },
      error: null,
    });

    expect((await POST(callbackRequest())).status).toBe(200);
    expect(mocks.enqueueEmail).not.toHaveBeenCalled();
    expect(mocks.emitVendorEvent).not.toHaveBeenCalled();
  });

  it('does not use return URL input as settlement authority', async () => {
    await POST(callbackRequest({ return_url: 'https://attacker.example/paid' }));

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.rpc.mock.calls[0])).not.toContain('attacker.example');
  });
});

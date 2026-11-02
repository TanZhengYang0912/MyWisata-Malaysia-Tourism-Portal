import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  rate: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/lib/checkout/guest-session', () => ({
  guestPrivateResponse: (data: unknown, status = 200) => Response.json({ data, error: null }, { status }),
  guestAddressRateKey: () => 'test-address',
  hashGuestCredential: (value: string) => `hash:${value}`,
  isSameOriginMutation: () => true,
  readGuestJson: async (request: Request) => request.json(),
  reserveGuestRateLimit: mocks.rate,
}));

import { POST } from '../route';

const ORDER_ID = '1d4057cf-c821-4b05-a454-61dbdc42d32c';
const DISPLAY_ID = 'ORD-1000';
let orders: Array<{ id: string; display_id: string; contact_email: string }>;

function queryFor(column: string, value: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((name: string, input: string) => { if (name === column && input === value) query.result = orders.filter((order) => order[name as 'id' | 'display_id'] === input); return query; }),
    is: vi.fn(() => query),
    not: vi.fn(() => query),
    in: vi.fn(() => query),
    ilike: vi.fn((_name: string, input: string) => { query.result = orders.filter(order => order.contact_email.toLowerCase() === input.toLowerCase().replace(/\\([%_\\])/g, '$1')); return query; }),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: query.result[0] ?? null, error: null })),
    result: [] as typeof orders,
  };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  orders = [{ id: ORDER_ID, display_id: DISPLAY_ID, contact_email: 'guest@example.com' }];
  mocks.rate.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.from.mockImplementation(() => queryFor('id', ORDER_ID));
});

describe('Guest order recovery references', () => {
  it('looks up the complete public number and rate-limits by the canonical order UUID', async () => {
    mocks.from.mockImplementation(() => queryFor('display_id', DISPLAY_ID));
    const response = await POST(new Request('https://example.test/api/guest/orders/recover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderReference: '#ord-1000', email: 'guest@example.com' }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.rate).toHaveBeenCalledWith(`recovery-order:${ORDER_ID}`, 3, 3600);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps the legacy UUID field but rejects ambiguous references without queuing mail', async () => {
    const response = await POST(new Request('https://example.test/api/guest/orders/recover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: ORDER_ID, email: 'guest@example.com' }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mocks.rate.mockResolvedValue(true);
    const ambiguous = await POST(new Request('https://example.test/api/guest/orders/recover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderReference: ORDER_ID.slice(0, 8), email: 'guest@example.com' }),
    }));
    expect(ambiguous.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('accepts email-only recovery, handles case and keeps a deterministic latest-order lookup', async () => {
    const query = queryFor('id', ORDER_ID);
    mocks.from.mockReturnValue(query);
    const response = await POST(new Request('https://example.test/api/guest/orders/recover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'GUEST@example.com' }),
    }));
    expect(response.status).toBe(200);
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(query.order).toHaveBeenCalledWith('id', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('escapes email wildcard characters and does not send when limited or invalid', async () => {
    const query = queryFor('id', ORDER_ID);
    mocks.from.mockReturnValue(query);
    const request = (email: string) => new Request('https://example.test/api/guest/orders/recover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    });
    await POST(request('guest_name@example.com'));
    expect(query.ilike).toHaveBeenCalledWith('contact_email', 'guest\\_name@example.com');
    mocks.rate.mockResolvedValue(false);
    await POST(request('guest@example.com'));
    await POST(request('invalid'));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('retries a failed enqueue once using the same idempotency key', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '08006' } }).mockResolvedValueOnce({ data: null, error: null });
    await POST(new Request('https://example.test/api/guest/orders/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: ORDER_ID, email: 'guest@example.com' }) }));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  });

  it('keeps the same public response when queuing the access link fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'internal failure' } });
    const matching = await POST(new Request('https://example.test/api/guest/orders/recover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: ORDER_ID, email: 'guest@example.com' }),
    }));

    mocks.from.mockImplementation(() => {
      const query = queryFor('id', ORDER_ID);
      query.result = [];
      return query;
    });
    const unmatched = await POST(new Request('https://example.test/api/guest/orders/recover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: ORDER_ID, email: 'other@example.com' }),
    }));

    expect(await matching.json()).toEqual(await unmatched.json());
    expect(matching.status).toBe(unmatched.status);
  });
});

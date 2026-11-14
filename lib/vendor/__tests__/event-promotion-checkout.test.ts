import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ retrieve: vi.fn(), expire: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/stripe', () => ({ stripe: { checkout: { sessions: { retrieve: mocks.retrieve, expire: mocks.expire } } } }));

import { expirePendingPromotionCheckout, recordPendingPromotionCheckout } from '../event-promotion-checkout';

// Chainable query stub that records eq() filters and update() payloads.
function db(pendingSessionId: string | null, updateResult: { data?: unknown; error: null | { message: string } } = { error: null }) {
  const calls = { eq: [] as Array<[string, unknown]>, update: [] as unknown[] };
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((column: string, value: unknown) => { calls.eq.push([column, value]); return builder; });
  builder.update = vi.fn((payload: unknown) => { calls.update.push(payload); return builder; });
  builder.maybeSingle = vi.fn(async () => ({ data: { pending_checkout_session_id: pendingSessionId }, error: null }));
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(updateResult).then(resolve);
  return { client: { from: vi.fn(() => builder) } as never, calls };
}

describe('expirePendingPromotionCheckout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing when no Checkout is open', async () => {
    const { client } = db(null);
    await expect(expirePendingPromotionCheckout(client, 'vendor-1', 'promo-1')).resolves.toEqual({ ok: true });
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it('expires an open session and clears only that session id', async () => {
    mocks.retrieve.mockResolvedValue({ status: 'open' });
    const { client, calls } = db('cs_old');
    await expect(expirePendingPromotionCheckout(client, 'vendor-1', 'promo-1')).resolves.toEqual({ ok: true });
    expect(mocks.expire).toHaveBeenCalledWith('cs_old');
    expect(calls.update).toEqual([{ pending_checkout_session_id: null, pending_checkout_amount_sen: null }]);
    expect(calls.eq).toContainEqual(['pending_checkout_session_id', 'cs_old']);
    expect(calls.eq).toContainEqual(['vendor_id', 'vendor-1']);
  });

  it('reports a completed session so the caller does not take a second payment', async () => {
    mocks.retrieve.mockResolvedValue({ status: 'complete' });
    const { client, calls } = db('cs_old');
    await expect(expirePendingPromotionCheckout(client, 'vendor-1', 'promo-1')).resolves.toEqual({ ok: false, reason: 'completed' });
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(calls.update).toEqual([]);
  });

  it('re-checks when expiry races with the vendor completing the payment', async () => {
    mocks.retrieve.mockResolvedValueOnce({ status: 'open' }).mockResolvedValueOnce({ status: 'complete' });
    mocks.expire.mockRejectedValue(new Error('session already complete'));
    const { client } = db('cs_old');
    await expect(expirePendingPromotionCheckout(client, 'vendor-1', 'promo-1')).resolves.toEqual({ ok: false, reason: 'completed' });
  });

  it('fails closed when Stripe cannot be reached', async () => {
    mocks.retrieve.mockRejectedValue(new Error('network'));
    const { client } = db('cs_old');
    await expect(expirePendingPromotionCheckout(client, 'vendor-1', 'promo-1')).resolves.toEqual({ ok: false, reason: 'stripe_error' });
  });
});

describe('recordPendingPromotionCheckout', () => {
  it('only records a session while the promotion is still approved', async () => {
    const { client, calls } = db(null, { data: [], error: null });
    await expect(recordPendingPromotionCheckout(client, 'vendor-1', 'promo-1', 'cs_new', 30_000)).resolves.toEqual({ ok: false, reason: 'not_payable' });
    expect(calls.eq).toContainEqual(['status', 'approved']);
    expect(calls.update).toEqual([{ pending_checkout_session_id: 'cs_new', pending_checkout_amount_sen: 30_000 }]);
  });
});

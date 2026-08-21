import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  reconcile: vi.fn(),
  process: vi.fn(),
}));

vi.mock('@/lib/payouts/tng-config', () => ({ isTngMockPayoutEnabled: mocks.enabled }));
vi.mock('@/lib/payouts/tng-mock-callbacks', () => ({
  reconcileTngMockCallbacks: mocks.reconcile,
  processTngMockCallbacks: mocks.process,
}));

import { GET } from '../route';

function request(secret = 'cron-test-secret') {
  return new Request('http://localhost/api/cron/tng-mock-callbacks', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe('GET /api/cron/tng-mock-callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-test-secret';
    mocks.enabled.mockReturnValue(true);
    mocks.reconcile.mockResolvedValue({ count: 2, inserted: 1, released: 1 });
    mocks.process.mockResolvedValue({ claimed: 2, delivered: 1, retried: 1, exhausted: 0 });
  });

  it('requires the configured cron bearer secret', async () => {
    expect((await GET(new Request('http://localhost/api/cron/tng-mock-callbacks'))).status).toBe(401);
    expect((await GET(request('wrong'))).status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('stays unavailable when non-production mock mode is disabled', async () => {
    mocks.enabled.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('reconciles before processing and returns aggregate counts only', async () => {
    const order: string[] = [];
    mocks.reconcile.mockImplementation(async () => { order.push('reconcile'); return { count: 2, inserted: 1, released: 1 }; });
    mocks.process.mockImplementation(async () => { order.push('process'); return { claimed: 2, delivered: 1, retried: 1, exhausted: 0 }; });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(order).toEqual(['reconcile', 'process']);
    expect(body).toEqual({
      reconciled: 2,
      inserted: 1,
      released: 1,
      claimed: 2,
      delivered: 1,
      retried: 1,
      exhausted: 0,
    });
    expect(JSON.stringify(body)).not.toMatch(/withdrawal|payout|event|outbox|user/i);
  });

  it('returns a generic failure without leaking processor errors', async () => {
    mocks.reconcile.mockRejectedValue(new Error('provider_payout_id=secret-value'));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'callback_processing_unavailable' });
    expect(JSON.stringify(body)).not.toContain('secret-value');
  });
});

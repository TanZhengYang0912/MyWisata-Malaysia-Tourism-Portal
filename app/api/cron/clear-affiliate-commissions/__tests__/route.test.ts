import { describe, expect, it, vi, beforeEach } from 'vitest';

const createServiceClient = vi.fn();
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));

const clearMaturedCommissions = vi.fn();
vi.mock('@/lib/affiliate/clearing', () => ({ clearMaturedCommissions }));

const { POST } = await import('../route');

describe('POST /api/cron/clear-affiliate-commissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-test-secret';
    createServiceClient.mockReturnValue({});
  });

  it('requires the configured cron secret', async () => {
    const response = await POST(new Request('http://localhost/api/cron/clear-affiliate-commissions', { method: 'POST' }));

    expect(response.status).toBe(401);
    expect(clearMaturedCommissions).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret the same as a missing one', async () => {
    const response = await POST(new Request('http://localhost/api/cron/clear-affiliate-commissions', {
      method: 'POST',
      headers: { authorization: 'Bearer not-the-secret' },
    }));

    expect(response.status).toBe(401);
    expect(clearMaturedCommissions).not.toHaveBeenCalled();
  });

  it('clears matured commissions and returns aggregate counts only', async () => {
    clearMaturedCommissions.mockResolvedValue({
      cleared: [
        { attributionId: 'a1', userId: 'u1', orderId: 'o1', amountRM: 1.65 },
        { attributionId: 'a2', userId: 'u2', orderId: 'o2', amountRM: 2.75 },
      ],
      reversed: [{ attributionId: 'a3', orderId: 'o3', reason: 'order cancelled' }],
      skipped: 1,
      errors: [],
    });

    const response = await POST(new Request('http://localhost/api/cron/clear-affiliate-commissions', {
      method: 'POST',
      headers: { authorization: 'Bearer cron-test-secret' },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ cleared: 2, clearedAmountRM: 4.4, reversed: 1, skipped: 1, errors: 0 });
    // No user/order/attribution ids in the response — counts only, same as the other cron routes.
    expect(JSON.stringify(body)).not.toMatch(/u1|u2|o1|o2|a1|a2/);
  });

  it('is safe to call twice in a row — a second run with nothing left to claim reports zero cleared', async () => {
    clearMaturedCommissions.mockResolvedValueOnce({
      cleared: [{ attributionId: 'a1', userId: 'u1', orderId: 'o1', amountRM: 1.65 }],
      reversed: [],
      skipped: 0,
      errors: [],
    });
    clearMaturedCommissions.mockResolvedValueOnce({
      cleared: [],
      reversed: [],
      skipped: 0,
      errors: [],
    });

    const request = () => new Request('http://localhost/api/cron/clear-affiliate-commissions', {
      method: 'POST',
      headers: { authorization: 'Bearer cron-test-secret' },
    });

    const first = await (await POST(request())).json();
    const second = await (await POST(request())).json();

    expect(first.cleared).toBe(1);
    expect(second.cleared).toBe(0);
    expect(clearMaturedCommissions).toHaveBeenCalledTimes(2);
  });
});

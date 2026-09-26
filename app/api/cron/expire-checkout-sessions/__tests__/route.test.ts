import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc }) }));

import { GET } from '../route';

describe('GET /api/cron/expire-checkout-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-test-secret');
    rpc.mockResolvedValue({ data: 3, error: null });
  });

  it('fails closed when the cron secret is missing or invalid', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(new Request('http://localhost/api/cron/expire-checkout-sessions'))).status).toBe(503);
    vi.stubEnv('CRON_SECRET', 'cron-test-secret');
    expect((await GET(new Request('http://localhost/api/cron/expire-checkout-sessions', {
      headers: { authorization: 'Bearer wrong' },
    }))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('expires abandoned checkout sessions only after cron authorization', async () => {
    const response = await GET(new Request('http://localhost/api/cron/expire-checkout-sessions', {
      headers: { authorization: 'Bearer cron-test-secret' },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ expired: 3 });
    expect(rpc).toHaveBeenCalledWith('expire_checkout_sessions');
  });

  it('does not report success when expiration fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    const response = await GET(new Request('http://localhost/api/cron/expire-checkout-sessions', {
      headers: { authorization: 'Bearer cron-test-secret' },
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'checkout_expiration_failed' });
  });
});

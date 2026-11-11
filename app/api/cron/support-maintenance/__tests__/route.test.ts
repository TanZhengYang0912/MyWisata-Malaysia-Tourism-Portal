import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ cleanup: vi.fn(), reconcile: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/support/attachment-cleanup', () => ({ cleanupSupportAttachments: mocks.cleanup, reconcileSupportAttachments: mocks.reconcile }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }));

import { GET } from '../route';

describe('GET /api/cron/support-maintenance', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.cleanup.mockResolvedValue({ claimed: 0, deleted: 0, rescheduled: 0 });
    mocks.reconcile.mockResolvedValue({ claimed: 0, recovered: 0, unknown: 0 });
    mocks.rpc.mockResolvedValue({ data: 4, error: null });
  });

  it('requires cron authorization and reports bounded expired handoff token cleanup', async () => {
    expect((await GET(new Request('http://localhost'))).status).toBe(401);
    const response = await GET(new Request('http://localhost', { headers: { authorization: 'Bearer cron-secret' } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      claimed: 0,
      deleted: 0,
      rescheduled: 0,
      reconciliation: { claimed: 0, recovered: 0, unknown: 0 },
      expiredHandoffTokens: 4,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('cleanup_support_handoff_tokens');
  });
});

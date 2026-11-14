import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ rpc: mocks.rpc, storage: { from: vi.fn(() => ({ remove: mocks.remove })) } })),
}));

import { GET, POST } from '../route';

const request = (authorization?: string) => new Request('https://example.test/api/cron/purge-avatar-assets', {
  headers: authorization ? { authorization } : {},
});

describe('/api/cron/purge-avatar-assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('answers the GET that Vercel Cron sends, with the same handler as POST', () => {
    expect(GET).toBe(POST);
    const schedule = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as { crons: Array<{ path: string }> };
    expect(schedule.crons.map((cron) => cron.path)).toContain('/api/cron/purge-avatar-assets');
  });

  it('rejects a call without the cron secret before touching the database', async () => {
    expect((await GET(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('removes claimed objects and confirms each one', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ asset_id: 'a1', storage_path: 'user/a1.webp', claim_token: 't1' }], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    mocks.remove.mockResolvedValue({ error: null });

    const response = await GET(request('Bearer cron-secret'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { claimed: 1, deleted: 1, failed: 0 } });
    expect(mocks.remove).toHaveBeenCalledWith(['user/a1.webp']);
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_profile_avatar_cleanup', { p_asset_id: 'a1', p_claim_token: 't1', p_succeeded: true });
  });
});

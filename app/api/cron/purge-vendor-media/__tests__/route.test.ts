import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ rpc: mocks.rpc, storage: { from: mocks.from } })),
}));
vi.mock('@/lib/log', () => ({ log: vi.fn() }));

import { GET, POST } from '../route';

const VENDOR = '11111111-1111-4111-8111-111111111111';
const request = (authorization = 'Bearer cron-secret') => new Request('https://example.test/api/cron/purge-vendor-media', { headers: { authorization } });
const rows = [
  { object_id: 'o1', bucket: 'vendor-products', storage_path: `${VENDOR}/draft-u/a.png`, claim_token: 't1', action: 'delete' },
  { object_id: 'o2', bucket: 'event-posters', storage_path: `${VENDOR}/b.png`, claim_token: null, action: 'keep_referenced' },
  { object_id: 'o3', bucket: 'vendor-products', storage_path: `${VENDOR}/c.png`, claim_token: null, action: 'keep_recent' },
];

describe('/api/cron/purge-vendor-media', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.from.mockReturnValue({ remove: mocks.remove });
    mocks.remove.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects calls without the cron secret before touching the database', async () => {
    expect((await GET(request('Bearer nope'))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('is a dry run by default: reports candidates and removes nothing', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: rows.map((row) => ({ ...row, claim_token: null })), error: null });
    const response = await GET(request());
    const body = await response.json();
    expect(mocks.rpc).toHaveBeenCalledWith('claim_vendor_media_cleanup', { p_limit: 50, p_dry_run: true });
    expect(body.data).toMatchObject({ dryRun: true, checked: 3, referencedSkipped: 1, recentSkipped: 1, deleted: 0 });
    expect(body.data.wouldDelete).toEqual([{ bucket: 'vendor-products', path: `${VENDOR}/draft-u/a.png` }]);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('removes only claimed delete candidates in delete mode and confirms each with its token', async () => {
    vi.stubEnv('VENDOR_MEDIA_CLEANUP_MODE', 'delete');
    mocks.rpc.mockResolvedValueOnce({ data: rows, error: null }).mockResolvedValueOnce({ data: true, error: null });
    const body = await (await POST(request())).json();
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'claim_vendor_media_cleanup', { p_limit: 50, p_dry_run: false });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith([`${VENDOR}/draft-u/a.png`]);
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_vendor_media_cleanup', { p_object_id: 'o1', p_claim_token: 't1', p_succeeded: true });
    expect(body.data).toMatchObject({ dryRun: false, deleted: 1, failed: 0 });
  });

  it('never removes a path outside a vendor folder; it releases the row instead', async () => {
    vi.stubEnv('VENDOR_MEDIA_CLEANUP_MODE', 'delete');
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ ...rows[0], storage_path: `${VENDOR}/../other/x.png` }], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const body = await (await POST(request())).json();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_vendor_media_cleanup', expect.objectContaining({ p_succeeded: false }));
    expect(body.data.failed).toBe(1);
  });

  it('is not scheduled until Phase 3', () => {
    const schedule = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as { crons: Array<{ path: string }> };
    expect(schedule.crons.map((cron) => cron.path)).not.toContain('/api/cron/purge-vendor-media');
  });
});

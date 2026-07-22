import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), limit: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ from: mocks.from })) }));

import { GET } from '../route';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'configured';
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue({ error: null });
  });

  it('returns readiness without exposing secrets', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok', checks: { database: 'ok', cron: 'configured' } });
  });

  it('returns 503 when the database is unavailable', async () => {
    mocks.limit.mockResolvedValue({ error: { message: 'database unavailable' } });
    const response = await GET();
    expect(response.status).toBe(503);
  });
});

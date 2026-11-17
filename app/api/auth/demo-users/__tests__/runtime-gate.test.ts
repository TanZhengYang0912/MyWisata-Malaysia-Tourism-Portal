import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServiceClient = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));

import { GET } from '../route';

describe('GET /api/auth/demo-users runtime gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MYLAWATAN_DEMO_TOOLS', 'false');
    vi.stubEnv('MYLAWATAN_ENV', '');
    vi.stubEnv('VERCEL_ENV', '');
  });

  it('returns an empty account list without touching service-role data outside demo runtimes', async () => {
    const response = await GET(new Request('http://localhost/api/auth/demo-users'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
    expect(createServiceClient).not.toHaveBeenCalled();
  });
});

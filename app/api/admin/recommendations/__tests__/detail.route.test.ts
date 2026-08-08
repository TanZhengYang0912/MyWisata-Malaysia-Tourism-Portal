import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => {
    throw new Error('service client must not be created before authorization');
  }),
}));

import { GET } from '@/app/api/admin/recommendations/[id]/route';

const routePath = 'app/api/admin/recommendations/[id]/route.ts';
const recommendationId = '3bd3f3ef-8e4c-4bbc-b7f5-be5d9f9ae9fe';

describe('GET /api/admin/recommendations/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has a dedicated protected detail route', () => {
    expect(existsSync(routePath)).toBe(true);
  });

  it('rejects unauthenticated callers before accessing private evidence', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'no session' },
    });

    const response = await GET(new Request(`http://localhost/api/admin/recommendations/${recommendationId}`), {
      params: Promise.resolve({ id: recommendationId }),
    });

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects non-admin callers before accessing private evidence', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const response = await GET(new Request(`http://localhost/api/admin/recommendations/${recommendationId}`), {
      params: Promise.resolve({ id: recommendationId }),
    });

    expect(response.status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledWith('is_admin', { uid: 'user-1' });
  });
});

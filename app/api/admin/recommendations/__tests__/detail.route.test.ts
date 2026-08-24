import { existsSync, readFileSync } from 'node:fs';
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

  it('does not load localization drafts unless the caller is a Super Admin', () => {
    const routeSource = readFileSync(routePath, 'utf8');
    expect(routeSource).toContain("db.rpc('is_super_admin', { uid: user.id })");
    expect(routeSource).toContain('isSuperAdmin\n      ? service');
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
    expect(mocks.rpc).toHaveBeenCalledWith('can_review_recommendation', { uid: 'user-1' });
  });
});

describe('recommendation assignment and review evidence contract', () => {
  it('claims pending work and returns server-owned decision capabilities', () => {
    const source = readFileSync('app/api/admin/recommendations/[id]/route.ts', 'utf8');

    expect(source).toContain("rpc('claim_recommendation_review'");
    expect(source).toContain("from('recommendation_review_events')");
    expect(source).toContain('availableActions');
    expect(source).toContain('reviewEvents');
  });

  it('uses short-lived signed evidence URLs and fails closed when review events cannot load', () => {
    const source = readFileSync('app/api/admin/recommendations/[id]/route.ts', 'utf8');

    expect(source).toContain('createSignedUrl(image.storage_path, 600)');
    expect(source).toContain('reviewEventsError');
    expect(source).toContain("apiFail('EVIDENCE_FAILED'");
  });
});

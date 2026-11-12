import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  getConductQueue: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/moderation/conduct-queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/moderation/conduct-queue')>()),
  getConductQueue: mocks.getConductQueue,
}));

import { GET } from '../route';

function request(query = '') {
  return new Request(`http://localhost/api/admin/conduct-flags${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  mocks.isSuperAdmin.mockResolvedValue(true);
  mocks.createServiceClient.mockReturnValue({});
  mocks.getConductQueue.mockResolvedValue({ ok: true, data: {
    items: [], total: 0, page: 1, pageSize: 15, totalPages: 1,
    metrics: { needsAction: 0, flaggedConduct: 0, reportedChat: 0, highSeverity: 0, reviewed: 0 },
  } });
});

describe('GET /api/admin/conduct-flags', () => {
  it('requires an authenticated super admin', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(request())).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'staff-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(false);
    expect((await GET(request())).status).toBe(403);
    expect(mocks.getConductQueue).not.toHaveBeenCalled();
  });

  it('forces the compatibility list through the bounded flagged-conduct query', async () => {
    const response = await GET(request('?page=2&pageSize=25'));

    expect(response.status).toBe(200);
    expect(mocks.getConductQueue).toHaveBeenCalledWith({}, 'admin-1', {
      page: 2, pageSize: 25, query: '', reviewState: 'all', recordType: 'flagged_conduct',
    });
    await expect(response.json()).resolves.toMatchObject({ data: { items: [], total: 0, page: 1 } });
  });
});

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

describe('GET /api/admin/chat-conduct-reports', () => {
  it('returns a retryable error when authentication cannot be verified', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 503 } });

    const response = await GET(new Request('http://localhost/api/admin/chat-conduct-reports'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('QUEUE_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('AuthRetryableFetchError');
    expect(mocks.getConductQueue).not.toHaveBeenCalled();
  });

  it('forces the compatibility list through the bounded reported-chat query', async () => {
    const response = await GET(new Request('http://localhost/api/admin/chat-conduct-reports'));

    expect(response.status).toBe(200);
    expect(mocks.getConductQueue).toHaveBeenCalledWith(expect.anything(), 'admin-1', {
      page: 1, pageSize: 15, query: '', reviewState: 'all', recordType: 'reported_chat',
    });
    await expect(response.json()).resolves.toMatchObject({ data: { items: [], total: 0, pageSize: 15 } });
  });

  it('returns a retryable safe error when the super-admin check cannot be read', async () => {
    mocks.isSuperAdmin.mockRejectedValue(new Error('super_admin_lookup_unavailable'));

    const response = await GET(new Request('http://localhost/api/admin/chat-conduct-reports'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('QUEUE_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('super_admin_lookup_unavailable');
    expect(mocks.getConductQueue).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));

import { GET } from '../route';

function request(query = '') {
  return new Request(`http://localhost/api/admin/conduct-queue${query}`);
}

function queueResponse() {
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: 15,
    totalPages: 1,
    metrics: { needsAction: 0, flaggedConduct: 0, reportedChat: 0, highSeverity: 0, reviewed: 0 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  mocks.isSuperAdmin.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: queueResponse(), error: null });
});

describe('GET /api/admin/conduct-queue', () => {
  it('requires an authenticated super admin before querying the service role', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.getUser.mockResolvedValue({ data: { user: { id: 'staff-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(false);
    expect((await GET(request())).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    '?page=0',
    '?pageSize=10',
    `?query=${'x'.repeat(201)}`,
    '?reviewState=archived',
    '?recordType=unknown',
  ])('rejects invalid filters with 422: %s', async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('uses the bounded, normalized database contract and returns global metrics', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: queueResponse(), error: null });

    const response = await GET(request('?page=2&pageSize=25&query=%20refund%20&reviewState=all&recordType=reported_chat'));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('get_admin_conduct_queue', {
      p_actor_id: 'admin-1',
      p_page: 2,
      p_page_size: 25,
      p_query: 'refund',
      p_review_state: 'all',
      p_record_type: 'reported_chat',
    });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('returns a retryable safe error when the RPC fails or returns an invalid shape', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private database host' } });
    const failed = await GET(request());
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain('private database host');

    mocks.rpc.mockResolvedValueOnce({ data: { items: 'wrong-shape' }, error: null });
    expect((await GET(request())).status).toBe(503);
  });
});

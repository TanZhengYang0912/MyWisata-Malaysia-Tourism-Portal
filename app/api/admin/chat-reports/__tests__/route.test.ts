import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), createServiceClient: vi.fn(), roleRpc: vi.fn(), reportRpc: vi.fn(), getUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));

import { GET } from '../route';

describe('GET /api/admin/chat-reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.roleRpc });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.roleRpc.mockResolvedValue({ data: true, error: null });
    mocks.createServiceClient.mockReturnValue({ rpc: mocks.reportRpc });
    mocks.reportRpc.mockResolvedValue({ data: { reports: [], page: 1, pageSize: 10, total: 0, summary: { openCount: 5, closedCount: 2 } }, error: null });
  });

  it('passes validated filters to the bounded database query and preserves global totals', async () => {
    const response = await GET(new Request('http://localhost/api/admin/chat-reports?page=2&pageSize=25&tab=closed&closedStatus=dismissed&reason=scam&sort=oldest&search=outlet'));
    expect(response.status).toBe(200);
    expect(mocks.reportRpc).toHaveBeenCalledWith('list_admin_chat_reports', {
      p_page: 2, p_page_size: 25, p_tab: 'closed', p_closed_status: 'dismissed',
      p_reason: 'scam', p_sort: 'oldest', p_search: 'outlet',
    });
    await expect(response.json()).resolves.toMatchObject({ data: { page: 1, total: 0, summary: { openCount: 5, closedCount: 2 } } });
  });

  it('rejects unauthenticated users before creating the privileged client', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(new Request('http://localhost/api/admin/chat-reports'));
    expect(response.status).toBe(401);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('rejects invalid page sizes and reports RPC failures', async () => {
    expect((await GET(new Request('http://localhost/api/admin/chat-reports?pageSize=100'))).status).toBe(422);
    mocks.reportRpc.mockResolvedValue({ data: null, error: { message: 'database detail' } });
    const response = await GET(new Request('http://localhost/api/admin/chat-reports'));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('database detail');
  });
});

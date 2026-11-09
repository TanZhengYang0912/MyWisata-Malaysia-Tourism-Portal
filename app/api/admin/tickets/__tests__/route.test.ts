import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '7df122f8-afae-4249-8504-bdd465a78f31';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), isSuperAdmin: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })),
}));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));

import { GET } from '../route';

describe('GET /api/admin/tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({
      data: {
        tickets: [{
          id: 'ticket-1', userName: 'Customer', subject: 'Refund', category: 'payment',
          classificationMethod: null, status: 'open', createdAt: '2026-11-01T00:00:00Z',
          lastActivityAt: '2026-11-01T00:00:00Z', unread: true, unanswered: true,
        }],
        stats: { open: 2, inProgress: 1, resolved: 3, unanswered: 1, avgFirstResponseHours: 2.5 },
        page: 2,
        pageSize: 10,
        total: 11,
        totalPages: 2,
      },
      error: null,
    });
  });

  it('passes bounded filters to the authenticated queue RPC and returns a private response', async () => {
    const response = await GET(new Request('http://localhost/api/admin/tickets?page=2&category=payment&status=open&assignedToMe=true&unreadOnly=true&search=refund&sort=unread'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('get_admin_support_queue', {
      p_page: 2,
      p_category: 'payment',
      p_status: 'open',
      p_assigned_to_me: true,
      p_unread_only: true,
      p_search: 'refund',
      p_sort: 'unread',
    });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(body.data.total).toBe(11);
    expect(JSON.stringify(body)).not.toContain('body');
  });

  it('denies unauthorized requests before invoking the queue RPC', async () => {
    mocks.isSuperAdmin.mockResolvedValue(false);

    const response = await GET(new Request('http://localhost/api/admin/tickets'));

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects invalid filters before invoking the queue RPC', async () => {
    const response = await GET(new Request('http://localhost/api/admin/tickets?page=0'));

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

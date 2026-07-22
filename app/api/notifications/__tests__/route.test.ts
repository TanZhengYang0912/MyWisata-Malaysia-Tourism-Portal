import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })),
}));

import { GET } from '../route';

const userId = '11111111-1111-4111-8111-111111111111';

function request(query = '') {
  return new Request(`http://localhost/api/notifications${query}`);
}

describe('GET /api/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [{ id: 'n1', type: 'withdrawal_hold', title: 'Needs review', body: 'More information is needed.', link: '/customer/support', category: 'wallet', metadata: {}, read_at: null, created_at: '2026-07-20T00:00:00.000Z' }],
        count: 16,
        error: null,
      }),
    };
    mocks.from.mockReturnValue(query);
  });

  it('requires authentication', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET(request())).status).toBe(401);
  });

  it('limits the feed to the requested page and wallet category', async () => {
    const response = await GET(request('?page=2&pageSize=100&category=wallet&read=unread'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.page).toBe(2);
    expect(body.data.pageSize).toBe(50);
    expect(body.data.totalPages).toBe(1);
    expect(body.data.items[0].readAt).toBeNull();
    expect(mocks.from).toHaveBeenCalledWith('notifications');
  });

  it('ignores unknown category filters instead of returning an empty feed', async () => {
    await GET(request('?category=unknown'));
    const query = mocks.from.mock.results[0]?.value;
    expect(query.eq).toHaveBeenCalledWith('user_id', userId);
    expect(query.eq).not.toHaveBeenCalledWith('category', 'unknown');
  });
});

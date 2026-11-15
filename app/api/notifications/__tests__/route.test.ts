import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getClaims: vi.fn(), from: vi.fn(), staffAccess: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser, getClaims: mocks.getClaims }, from: mocks.from })),
}));

vi.mock('@/lib/notifications/staff-access', () => ({
  requireStaffNotificationAccess: mocks.staffAccess,
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
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: userId } }, error: null });
    mocks.staffAccess.mockResolvedValue(null);
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [{ id: 'n1', type: 'withdrawal_hold', title: 'Needs review', body: 'More information is needed.', link: '/customer/support', category: 'wallet', metadata: {}, read_at: null, created_at: '2026-07-20T00:00:00.000Z' }],
        count: 16,
        error: null,
      }),
    };
    mocks.from.mockReturnValue(query);
  });

  it('requires authentication', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null });
    expect((await GET(request())).status).toBe(401);
  });

  it('verifies the customer feed locally from the token claims, without an Auth server round trip', async () => {
    const response = await GET(request('?scope=customer'));

    expect(response.status).toBe(200);
    expect(mocks.getClaims).toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.from.mock.results[0]?.value.eq).toHaveBeenCalledWith('user_id', userId);
  });

  it('keeps the Auth server check for the staff inbox', async () => {
    const response = await GET(request('?scope=staff'));

    expect(response.status).toBe(200);
    expect(mocks.getUser).toHaveBeenCalled();
    expect(mocks.getClaims).not.toHaveBeenCalled();
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

  it('uses a stable id tie-breaker for notifications with the same creation time', async () => {
    await GET(request('?page=1&pageSize=15'));
    const query = mocks.from.mock.results[0]?.value;
    expect(query.order).toHaveBeenNthCalledWith(1, 'created_at', { ascending: false });
    expect(query.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false });
  });

  it('accepts the messages category (chat notifications) as a real filter', async () => {
    await GET(request('?category=messages'));
    const query = mocks.from.mock.results[0]?.value;
    expect(query.eq).toHaveBeenCalledWith('category', 'messages');
  });

  it('authorizes staff scope and keeps the feed limited to the current user', async () => {
    const response = await GET(request('?scope=staff&category=wallet'));
    const query = mocks.from.mock.results[0]?.value;
    expect(response.status).toBe(200);
    expect(mocks.staffAccess).toHaveBeenCalledWith(expect.any(Object), userId);
    expect(query.eq).toHaveBeenCalledWith('user_id', userId);
    expect(query.eq).toHaveBeenCalledWith('category', 'wallet');
  });

  it('does not query staff notifications when staff authorization fails', async () => {
    mocks.staffAccess.mockResolvedValue(Response.json({ error: 'staff verification required' }, { status: 403 }));
    const response = await GET(request('?scope=staff'));
    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('ignores unknown category filters instead of returning an empty feed', async () => {
    await GET(request('?category=unknown'));
    const query = mocks.from.mock.results[0]?.value;
    expect(query.eq).toHaveBeenCalledWith('user_id', userId);
    expect(query.eq).not.toHaveBeenCalledWith('category', 'unknown');
  });
});

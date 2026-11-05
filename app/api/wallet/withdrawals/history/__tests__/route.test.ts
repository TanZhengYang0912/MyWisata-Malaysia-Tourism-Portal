import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUser, getMyWithdrawalHistoryPage } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getMyWithdrawalHistoryPage: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ service: true }) }));
vi.mock('@/backend/domains/commerce', () => ({ getMyWithdrawalHistoryPage }));

import { GET } from '../route';

const userId = '11111111-1111-4111-8111-111111111111';
const cursorId = '22222222-2222-4222-8222-222222222222';

describe('GET /api/wallet/withdrawals/history', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: userId } }, error: null });
    getMyWithdrawalHistoryPage.mockReset().mockResolvedValue({
      requests: [], pageSize: 25, totalCount: 0, hasMore: false, nextCursor: null,
    });
  });

  it('requires an authenticated customer', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(new Request('http://localhost/api/wallet/withdrawals/history'));

    expect(response.status).toBe(401);
    expect(getMyWithdrawalHistoryPage).not.toHaveBeenCalled();
  });

  it('binds the history query to the authenticated user and validates the cursor pair', async () => {
    const response = await GET(new Request(
      `http://localhost/api/wallet/withdrawals/history?pageSize=25&beforeCreatedAt=2026-10-28T00%3A00%3A00.000Z&beforeId=${cursorId}`,
    ));

    expect(response.status).toBe(200);
    expect(getMyWithdrawalHistoryPage).toHaveBeenCalledWith(
      { service: true }, userId,
      { pageSize: 25, cursor: { createdAt: '2026-10-28T00:00:00.000Z', id: cursorId } },
    );
  });

  it('rejects malformed or incomplete cursors before reading the database', async () => {
    const response = await GET(new Request(
      'http://localhost/api/wallet/withdrawals/history?beforeCreatedAt=not-a-date',
    ));

    expect(response.status).toBe(400);
    expect(getMyWithdrawalHistoryPage).not.toHaveBeenCalled();
  });

  it('does not accept a client-supplied user id', async () => {
    await GET(new Request(
      'http://localhost/api/wallet/withdrawals/history?userId=another-user',
    ));

    expect(getMyWithdrawalHistoryPage).toHaveBeenCalledWith(
      { service: true }, userId, expect.objectContaining({ pageSize: 25 }),
    );
  });
});

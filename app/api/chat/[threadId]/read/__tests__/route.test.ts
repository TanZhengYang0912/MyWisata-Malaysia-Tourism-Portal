import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), thread: vi.fn(), allowed: vi.fn(), rpc: vi.fn(), update: vi.fn(), filters: [] as unknown[][] }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.thread }) }) }),
  }),
}));
vi.mock('@/lib/chat/authorization', () => ({ accessibleChatThreadIds: mocks.allowed }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      const chain = {
        update: (values: unknown) => { mocks.update(table, values); return chain; },
        eq: (column: string, value: unknown) => { mocks.filters.push(['eq', column, value]); return chain; },
        is: (column: string, value: unknown) => { mocks.filters.push(['is', column, value]); return Promise.resolve({ error: null }); },
      };
      return chain;
    },
  }),
}));

import { POST } from '../route';

const THREAD = { id: 't1', customer_id: 'customer-1', outlet_id: 'o1' };
const call = () => POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ threadId: 't1' }) });

describe('POST /api/chat/[threadId]/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters.length = 0;
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'customer-1' } } });
    mocks.thread.mockResolvedValue({ data: THREAD, error: null });
    mocks.allowed.mockResolvedValue(new Set(['t1']));
    mocks.rpc.mockResolvedValue({ data: 2, error: null });
  });

  // Opening a conversation used to leave its bell notification unread forever.
  it('marks the messages read and clears only the reader\'s own bell notification for this chat', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('mark_chat_thread_read', { p_user_id: 'customer-1', p_thread_id: 't1' });
    expect(mocks.update).toHaveBeenCalledWith('notifications', expect.objectContaining({ read_at: expect.any(String) }));
    expect(mocks.filters).toEqual(expect.arrayContaining([
      ['eq', 'event_key', 'chat:t1:customer-1'],
      ['eq', 'user_id', 'customer-1'],
      ['is', 'read_at', null],
    ]));
  });

  it('clears nothing for someone who is not in the conversation', async () => {
    mocks.allowed.mockResolvedValue(new Set());
    expect((await call()).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

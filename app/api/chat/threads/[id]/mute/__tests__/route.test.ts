import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), insert: vi.fn(), delete: vi.fn(), threadQuery: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => table === 'chat_threads'
      ? mocks.threadQuery()
      : { insert: mocks.insert, delete: mocks.delete },
  }),
}));
vi.mock('@/lib/chat/authorization', () => ({
  accessibleChatThreadIds: async (_supabase: unknown, _userId: string, threads: Array<{ id: string }>) => new Set(threads.map((thread) => thread.id)),
}));

import { DELETE, POST } from '../route';

const threadId = '22222222-2222-4222-8222-222222222222';
const params = { params: Promise.resolve({ id: threadId }) };

function deleteQuery(result: unknown) {
  const builder: Record<string, unknown> = {};
  builder.eq = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'customer-1' } } });
  mocks.threadQuery.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: threadId, customer_id: 'customer-1', outlet_id: 'outlet-1' }, error: null }),
  });
  mocks.insert.mockResolvedValue({ data: null, error: null });
  mocks.delete.mockReturnValue(deleteQuery({ data: null, error: null }));
});

describe('chat thread mute route failures', () => {
  it('returns a retryable safe error when muting fails', async () => {
    mocks.insert.mockResolvedValue({ error: { code: 'XX000', message: 'connection reset from internal-chat-db-4' } });

    const response = await POST(new Request('http://localhost/api/chat/threads/test/mute', { method: 'POST' }), params);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toMatchObject({ code: 'WRITE_UNAVAILABLE', message: 'Unable to update this conversation. Please try again.' });
    expect(JSON.stringify(payload)).not.toContain('internal-chat-db-4');
    expect(payload.error.requestId).toEqual(expect.any(String));
  });

  it('returns a retryable safe error when unmuting fails', async () => {
    mocks.delete.mockReturnValue(deleteQuery({ error: { code: 'XX000', message: 'connection reset from internal-chat-db-4' } }));

    const response = await DELETE(new Request('http://localhost/api/chat/threads/test/mute', { method: 'DELETE' }), params);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toMatchObject({ code: 'WRITE_UNAVAILABLE', message: 'Unable to update this conversation. Please try again.' });
    expect(JSON.stringify(payload)).not.toContain('internal-chat-db-4');
  });

  it('keeps duplicate mute idempotent', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    const response = await POST(new Request('http://localhost/api/chat/threads/test/mute', { method: 'POST' }), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { threadId, muted: true } });
  });
});

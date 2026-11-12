import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  authFrom: vi.fn(),
  serviceFrom: vi.fn(),
  accessibleChatThreadIds: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.authFrom }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.serviceFrom }) }));
vi.mock('@/lib/chat/authorization', () => ({ accessibleChatThreadIds: mocks.accessibleChatThreadIds }));

import { GET, POST } from '../route';

const threadId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const thread = { id: threadId, customer_id: userId, outlet_id: 'outlet-1' };

type QueryResult = { data?: unknown; count?: number | null; error?: { code?: string; message?: string } | null };

function query(result: QueryResult) {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ['select', 'eq', 'gt', 'gte', 'limit', 'insert'] as const) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = ((resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)) as unknown as (...args: unknown[]) => unknown;
  return builder;
}

const params = { params: Promise.resolve({ threadId }) };

function statusRequest() {
  return new Request(`http://localhost/api/chat/${threadId}/report`);
}

function request(body: unknown = { reason: 'spam', details: 'Repeated unwanted messages.' }) {
  return new Request(`http://localhost/api/chat/${threadId}/report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mocks.accessibleChatThreadIds.mockResolvedValue(new Set([threadId]));
  mocks.authFrom.mockImplementation((table: string) => {
    if (table === 'chat_threads') return query({ data: thread, error: null });
    if (table === 'chat_reports') return query({ data: null, error: null });
    throw new Error(`Unexpected auth table: ${table}`);
  });
  mocks.serviceFrom.mockImplementation((table: string) => {
    if (table === 'chat_report_bans') return query({ data: null, error: null });
    if (table === 'chat_reports') return query({ count: 0, error: null });
    throw new Error(`Unexpected service table: ${table}`);
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('legacy chat report route failure recovery', () => {
  it('returns only the current reporter’s open-report state', async () => {
    mocks.serviceFrom.mockReturnValue(query({ data: { id: 'report-1' }, error: null }));

    const response = await GET(statusRequest(), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { reported: true } });
  });

  it('returns a safe retry response when report status cannot be read', async () => {
    mocks.serviceFrom.mockReturnValue(query({ data: null, error: { code: '08006', message: 'private-chat-db-7' } }));

    const response = await GET(statusRequest(), params);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(payload)).not.toContain('private-chat-db-7');
  });

  it('returns 401 before reading the conversation when the session has expired', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST(request(), params);

    expect(response.status).toBe(401);
    expect(mocks.authFrom).not.toHaveBeenCalled();
  });

  it.each(['GET', 'POST'] as const)('returns 401 for an expired auth session on %s', async (method) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError' } });

    const response = method === 'GET'
      ? await GET(statusRequest(), params)
      : await POST(request(), params);

    expect(response.status).toBe(401);
    expect(mocks.authFrom).not.toHaveBeenCalled();
  });

  it('rejects malformed reasons and report details over 500 characters', async () => {
    expect((await POST(request({ reason: 'other', details: 9 }), params)).status).toBe(422);
    expect((await POST(request({ reason: 'unknown' }), params)).status).toBe(422);
    expect((await POST(request({ reason: 'other', details: 'x'.repeat(501) }), params)).status).toBe(422);
    expect(mocks.authFrom).not.toHaveBeenCalled();
  });

  it('returns a fixed read error without database diagnostics when the thread cannot be read', async () => {
    mocks.authFrom.mockReturnValueOnce(query({ data: null, error: { code: '08006', message: 'private-chat-db-7 is offline' } }));

    const response = await POST(request(), params);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toMatchObject({ code: 'READ_UNAVAILABLE' });
    expect(JSON.stringify(payload)).not.toContain('private-chat-db-7');
  });

  it('treats access lookup failure as temporary rather than as a nonparticipant', async () => {
    mocks.accessibleChatThreadIds.mockRejectedValue(new Error('private outlet access query'));

    const response = await POST(request(), params);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(payload)).not.toContain('private outlet access query');
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });

  it.each(['chat_report_bans', 'dismissed_count', 'recent_count'])('returns a safe retry message when the %s lookup fails', async (failedRead) => {
    if (failedRead === 'chat_report_bans') {
      mocks.serviceFrom.mockReturnValueOnce(query({ data: null, error: { code: '08006', message: 'private-chat-db-7' } }));
    } else {
      let reportCountRead = 0;
      mocks.serviceFrom.mockImplementation((table: string) => {
        if (table === 'chat_report_bans') return query({ data: null, error: null });
        if (table === 'chat_reports') {
          reportCountRead += 1;
          if (reportCountRead === (failedRead === 'dismissed_count' ? 1 : 2)) {
            return query({ count: null, error: { code: '08006', message: 'private-chat-db-7' } });
          }
          return query({ count: 0, error: null });
        }
        throw new Error(`Unexpected service table: ${table}`);
      });
    }

    const response = await POST(request(), params);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(payload)).not.toContain('private-chat-db-7');
  });

  it('returns a distinct result for a duplicate open report', async () => {
    mocks.authFrom.mockImplementation((table: string) => table === 'chat_threads'
      ? query({ data: thread, error: null })
      : query({ data: null, error: { code: '23505', message: 'duplicate key' } }));

    const response = await POST(request(), params);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('ALREADY_REPORTED');
  });

  it('does not return or log private database messages when report insertion fails', async () => {
    mocks.authFrom.mockImplementation((table: string) => table === 'chat_threads'
      ? query({ data: thread, error: null })
      : query({ data: null, error: { code: 'XX000', message: 'internal relation chat_reports_private failed' } }));

    const response = await POST(request(), params);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toMatchObject({ code: 'WRITE_UNAVAILABLE' });
    expect(payload.error.message).toContain('Do not submit it again');
    expect(JSON.stringify(payload)).not.toContain('chat_reports_private');
    expect(console.error).toHaveBeenCalledWith('[chat/report] insert failed', expect.objectContaining({ requestId: expect.any(String), errorCode: 'XX000' }));
  });
});

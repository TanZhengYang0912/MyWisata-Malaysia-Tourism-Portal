import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), classify: vi.fn(), clean: vi.fn() }));
function query(result: unknown) {
  const terminal = Promise.resolve(result);
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'insert']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.single = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return builder;
}
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: vi.fn() }) }));
vi.mock('@/lib/chatbot/classify-ai', () => ({ classifyTicketSmart: mocks.classify }));
vi.mock('@/lib/moderation/clean', () => ({ cleanUserContent: mocks.clean }));
vi.mock('@/lib/moderation/flags', () => ({ logModerationFlag: vi.fn() }));
vi.mock('@/lib/support/unread', () => ({ getLatestReplyTimestamps: vi.fn(), isUnread: vi.fn() }));

import { POST } from '../route';

describe('POST /api/support/tickets session ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'attacker' } } });
    mocks.from.mockImplementation((table: string) => table === 'chatbot_sessions'
      ? query({ data: { id: 'session-1', session_key: 'victim-session', user_id: 'victim' }, error: null })
      : query({ data: null, error: null }));
  });

  it('does not attach a support ticket to another account chat session', async () => {
    const response = await POST(new Request('http://localhost/api/support/tickets', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'victim-session', subject: 'Help', body: 'Need help with my order' }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.classify).not.toHaveBeenCalled();
    expect(mocks.clean).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
});

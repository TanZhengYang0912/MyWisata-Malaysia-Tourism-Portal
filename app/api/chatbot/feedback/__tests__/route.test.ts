import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), tables: {} as Record<string, Record<string, ReturnType<typeof vi.fn>>> }));

function query(result: unknown) {
  const terminal = Promise.resolve(result);
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'insert', 'update']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.single = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return builder;
}

function feedbackQuery(existing: unknown, created: unknown) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'insert', 'update']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => existing);
  builder.single = vi.fn(async () => created);
  builder.then = Promise.resolve(existing).then.bind(Promise.resolve(existing)) as ReturnType<typeof vi.fn>;
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ from: mocks.from })) }));

import { POST } from '../route';

const botMessage = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'bot',
  session_id: '22222222-2222-4222-8222-222222222222',
  chatbot_sessions: { id: '22222222-2222-4222-8222-222222222222', session_key: 'session-key-1', user_id: 'user-1' },
};

function request(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/chatbot/feedback', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionKey: 'session-key-1', messageId: botMessage.id, botAnswered: true, helpful: true, ...overrides }),
  });
}

describe('POST /api/chatbot/feedback ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.tables = {
      chatbot_messages: query({ data: botMessage, error: null }),
      chatbot_feedback: feedbackQuery({ data: null, error: null }, { data: { id: '44444444-4444-4444-8444-444444444444' }, error: null }),
    };
    mocks.from.mockImplementation((table: string) => mocks.tables[table]);
  });

  it('rejects a feedback request without its session key before any service write', async () => {
    const response = await POST(request({ sessionKey: undefined }));
    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects non-bot messages', async () => {
    mocks.tables.chatbot_messages = query({ data: { ...botMessage, role: 'user' }, error: null });
    const response = await POST(request());
    expect(response.status).toBe(422);
    expect(mocks.tables.chatbot_feedback.insert).not.toHaveBeenCalled();
  });

  it('requires the exact session and an authenticated owner for member sessions', async () => {
    mocks.tables.chatbot_messages = query({ data: { ...botMessage, chatbot_sessions: { ...botMessage.chatbot_sessions, session_key: 'other-session' } }, error: null });
    expect((await POST(request())).status).toBe(403);
    mocks.tables.chatbot_messages = query({ data: botMessage, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'another-user' } }, error: null });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.tables.chatbot_feedback.insert).not.toHaveBeenCalled();
  });

  it('does not attach an authenticated user to a guest session', async () => {
    mocks.tables.chatbot_messages = query({ data: {
      ...botMessage, chatbot_sessions: { ...botMessage.chatbot_sessions, user_id: null },
    }, error: null });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.tables.chatbot_feedback.insert).not.toHaveBeenCalled();
  });

  it('updates only matching feedback and never downgrades opened-ticket state', async () => {
    mocks.tables.chatbot_feedback = feedbackQuery({ data: {
      id: '33333333-3333-4333-8333-333333333333',
      session_id: botMessage.session_id,
      user_id: 'user-1',
      opened_ticket: true,
    }, error: null }, { data: null, error: null });

    const response = await POST(request({ helpful: false, openedTicket: false }));
    expect(response.status).toBe(200);
    expect(mocks.tables.chatbot_feedback.update).toHaveBeenCalledWith({ helpful: false });
  });

  it('writes feedback with the persisted session owner rather than trusting the request', async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(mocks.tables.chatbot_feedback.insert).toHaveBeenCalledWith(expect.objectContaining({
      session_id: botMessage.session_id, user_id: 'user-1', message_id: botMessage.id,
    }));
  });
});

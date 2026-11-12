import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createAuthClient: vi.fn(), getUser: vi.fn(), from: vi.fn(), tables: {} as Record<string, Record<string, ReturnType<typeof vi.fn>>>, guestCredential: vi.fn(), tokenHash: vi.fn(), bindGuest: vi.fn() }));

function query(result: unknown) {
  const terminal = Promise.resolve(result);
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'insert', 'update', 'lt', 'order', 'limit']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.single = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return builder;
}

function feedbackQuery(existing: unknown, created: unknown) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'insert', 'update', 'lt', 'order', 'limit']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => existing);
  builder.single = vi.fn(async () => created);
  builder.then = Promise.resolve(existing).then.bind(Promise.resolve(existing)) as ReturnType<typeof vi.fn>;
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createAuthClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ from: mocks.from })) }));
vi.mock('@/lib/chatbot/guest-session', () => ({
  readChatbotGuestCredential: mocks.guestCredential,
  hashChatbotGuestCredential: mocks.tokenHash,
  bindChatbotGuestSessionToken: mocks.bindGuest,
}));

import { POST } from '../route';

const botMessage = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'bot',
  session_id: '22222222-2222-4222-8222-222222222222',
  created_at: '2026-11-11T10:00:01.000Z',
  chatbot_sessions: { id: '22222222-2222-4222-8222-222222222222', session_key: 'session-key-1', user_id: 'user-1', guest_token_hash: null, channel: 'customer' },
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
    mocks.createAuthClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.guestCredential.mockReturnValue('a'.repeat(43));
    mocks.tokenHash.mockReturnValue('b'.repeat(64));
    mocks.bindGuest.mockResolvedValue('bound');
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

  it('returns a retryable auth failure instead of treating an auth outage as a guest', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 503 } });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('AUTH_UNAVAILABLE');
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

  it('does not attach customer feedback to an admin AI message', async () => {
    mocks.tables.chatbot_messages = query({ data: {
      ...botMessage,
      chatbot_sessions: { ...botMessage.chatbot_sessions, channel: 'admin' },
    }, error: null });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.tables.chatbot_feedback.insert).not.toHaveBeenCalled();
  });

  it('does not attach an authenticated user to a guest session', async () => {
    mocks.tables.chatbot_messages = query({ data: {
      ...botMessage, chatbot_sessions: { ...botMessage.chatbot_sessions, user_id: null },
    }, error: null });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.tables.chatbot_feedback.insert).not.toHaveBeenCalled();
  });

  it('returns a retryable error instead of treating guest binding outages as forbidden', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.tables.chatbot_messages = query({ data: {
      ...botMessage,
      chatbot_sessions: { ...botMessage.chatbot_sessions, user_id: null, guest_token_hash: null },
    }, error: null });
    mocks.bindGuest.mockResolvedValue('unavailable');

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('READ_UNAVAILABLE');
    expect(mocks.tables.chatbot_feedback.insert).not.toHaveBeenCalled();
  });

  it('updates only matching feedback and never downgrades opened-ticket state', async () => {
    mocks.tables.chatbot_feedback = feedbackQuery({ data: {
      id: '33333333-3333-4333-8333-333333333333',
      session_id: botMessage.session_id,
      user_id: 'user-1',
      question: null,
      question_source_version: 1,
      opened_ticket: true,
    }, error: null }, { data: null, error: null });

    const response = await POST(request({ helpful: false, openedTicket: false }));
    expect(response.status).toBe(200);
    expect(mocks.tables.chatbot_feedback.update).toHaveBeenCalledWith({ helpful: false });
  });

  it('skips the write when repeated feedback has no changes', async () => {
    const feedback = feedbackQuery({ data: {
      id: '33333333-3333-4333-8333-333333333333',
      session_id: botMessage.session_id,
      user_id: 'user-1',
      question: null,
      question_source_version: 1,
      helpful: true,
      opened_ticket: false,
    }, error: null }, { data: null, error: null });
    mocks.tables.chatbot_feedback = feedback;

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(feedback.update).not.toHaveBeenCalled();
    expect(feedback.insert).not.toHaveBeenCalled();
  });

  it('merges a concurrent first feedback insert into the existing message row', async () => {
    const feedback = feedbackQuery({ data: null, error: null }, { data: null, error: { code: '23505' } });
    feedback.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: {
        id: '33333333-3333-4333-8333-333333333333',
        session_id: botMessage.session_id,
        user_id: 'user-1',
        question: null,
        question_source_version: 1,
        helpful: false,
        opened_ticket: true,
      }, error: null });
    mocks.tables.chatbot_feedback = feedback;

    const response = await POST(request({ helpful: true, openedTicket: false }));

    expect(response.status).toBe(200);
    expect(feedback.insert).toHaveBeenCalledTimes(1);
    expect(feedback.update).toHaveBeenCalledWith({ helpful: true });
  });

  it('does not expose database details when a feedback update fails', async () => {
    const builder = feedbackQuery({ data: {
      id: '33333333-3333-4333-8333-333333333333',
      session_id: botMessage.session_id,
      user_id: 'user-1',
      question: null,
      question_source_version: 1,
      helpful: null,
      opened_ticket: false,
    }, error: null }, { data: null, error: null });
    builder.maybeSingle
      .mockResolvedValueOnce({ data: {
        id: '33333333-3333-4333-8333-333333333333',
        session_id: botMessage.session_id,
        user_id: 'user-1',
        question: null,
        question_source_version: 1,
        helpful: null,
        opened_ticket: false,
      }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'permission denied: internal policy detail' } });
    mocks.tables.chatbot_feedback = builder;

    const response = await POST(request({ helpful: false }));
    const payload = await response.json();
    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('WRITE_UNAVAILABLE');
    expect(JSON.stringify(payload)).not.toContain('internal policy detail');
  });

  it('writes feedback with the persisted session owner rather than trusting the request', async () => {
    const botQuery = query({ data: null, error: null });
    botQuery.maybeSingle
      .mockReturnValueOnce(Promise.resolve({ data: { ...botMessage, reply_to_message_id: 'user-msg-1' }, error: null }))
      .mockReturnValueOnce(Promise.resolve({ data: { id: 'user-msg-1', role: 'user', session_id: botMessage.session_id, body: 'My booking status? [PHONE]', body_sanitized: true }, error: null }));
    mocks.tables.chatbot_messages = botQuery;
    const response = await POST(request({ question: 'raw email me@example.com' }));
    expect(response.status).toBe(201);
    expect(mocks.tables.chatbot_feedback.insert).toHaveBeenCalledWith(expect.objectContaining({
      session_id: botMessage.session_id, user_id: 'user-1', message_id: botMessage.id,
      question: 'My booking status? [PHONE]', question_source_version: 1,
    }));
  });

  it('repairs a legacy feedback echo from the linked sanitized question on retry', async () => {
    const botQuery = query({ data: null, error: null });
    botQuery.maybeSingle
      .mockReturnValueOnce(Promise.resolve({ data: { ...botMessage, reply_to_message_id: 'user-msg-1' }, error: null }))
      .mockReturnValueOnce(Promise.resolve({ data: { id: 'user-msg-1', role: 'user', session_id: botMessage.session_id, body: 'My booking status? [PHONE]', body_sanitized: true }, error: null }));
    mocks.tables.chatbot_messages = botQuery;
    const feedback = feedbackQuery({ data: {
      id: '33333333-3333-4333-8333-333333333333',
      session_id: botMessage.session_id,
      user_id: 'user-1',
      question: 'raw email me@example.com',
      question_source_version: 0,
      helpful: true,
      opened_ticket: false,
    }, error: null }, { data: { id: '33333333-3333-4333-8333-333333333333' }, error: null });
    mocks.tables.chatbot_feedback = feedback;

    const response = await POST(request({ question: 'raw email me@example.com' }));

    expect(response.status).toBe(200);
    expect(feedback.update).toHaveBeenCalledWith({ question: 'My booking status? [PHONE]', question_source_version: 1 });
    expect(JSON.stringify(feedback.update.mock.calls)).not.toContain('raw email me@example.com');
  });

  it('does not copy a legacy question whose sanitization cannot be proven', async () => {
    const botQuery = query({ data: null, error: null });
    botQuery.maybeSingle
      .mockReturnValueOnce(Promise.resolve({ data: { ...botMessage, reply_to_message_id: 'legacy-user-msg' }, error: null }))
      .mockReturnValueOnce(Promise.resolve({ data: {
        id: 'legacy-user-msg',
        role: 'user',
        session_id: botMessage.session_id,
        body: 'Contact me at legacy@example.com',
        body_sanitized: false,
      }, error: null }));
    mocks.tables.chatbot_messages = botQuery;

    const response = await POST(request({ question: 'Contact me at legacy@example.com' }));

    expect(response.status).toBe(201);
    expect(botQuery.select).toHaveBeenLastCalledWith('id,role,session_id,body,body_sanitized');
    expect(mocks.tables.chatbot_feedback.insert).toHaveBeenCalledWith(expect.objectContaining({
      question: null,
      question_source_version: 1,
    }));
    expect(JSON.stringify(mocks.tables.chatbot_feedback.insert.mock.calls)).not.toContain('legacy@example.com');
  });
});

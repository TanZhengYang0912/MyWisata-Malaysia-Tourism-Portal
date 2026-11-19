import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), authFrom: vi.fn(), answer: vi.fn(), clean: vi.fn() }));
function query(result: unknown) {
  const terminal = Promise.resolve(result);
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'insert']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.single = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return builder;
}
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.authFrom })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/chatbot/answer', () => ({ answerQuestion: mocks.answer }));
vi.mock('@/lib/moderation/clean', () => ({ cleanUserContent: mocks.clean }));
vi.mock('@/lib/moderation/flags', () => ({ logModerationFlag: vi.fn() }));

import { POST } from '../route';

describe('POST /api/chatbot/ask session ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'attacker' } } });
    mocks.authFrom.mockImplementation(() => query({ data: null, error: null }));
    mocks.from.mockImplementation(() => query({
      data: { id: 'session-1', session_key: 'victim-session', user_id: 'victim' }, error: null,
    }));
  });

  it('does not append a conversation to another account session', async () => {
    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'victim-session', question: 'Where is my booking?' }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.answer).not.toHaveBeenCalled();
    expect(mocks.clean).not.toHaveBeenCalled();
  });

  it('does not reveal an order context to a guest', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'Where is my order?', orderId: '123e4567-e89b-42d3-a456-426614174000' }),
    }));

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it('does not reveal or process an order ID that is not owned by the customer', async () => {
    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'Where is my order?', orderId: '123e4567-e89b-42d3-a456-426614174000' }),
    }));

    expect(response.status).toBe(404);
    expect(mocks.answer).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns a minimal current order status checked by the authenticated owner', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'victim' } } });
    mocks.authFrom.mockImplementation(() => query({
      data: { id: '123e4567-e89b-42d3-a456-426614174000', display_id: 'MW-ORDER-42', status: 'PAID' }, error: null,
    }));
    mocks.clean.mockResolvedValue({ display: 'Where is my order?', original: 'Where is my order?', hadPII: false, hadSlur: false });
    mocks.answer.mockResolvedValue({ answer: 'I can help with that.', kbMatched: true, usedKb: [], language: 'en' });

    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'victim-session', question: 'Where is my order?', orderId: '123e4567-e89b-42d3-a456-426614174000' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.orderContext).toMatchObject({ id: '123e4567-e89b-42d3-a456-426614174000', displayId: 'MW-ORDER-42', status: 'PAID' });
    expect(body.data.orderContext.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('uses local FAQ mode and reports when personal data is withheld from AI', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'victim' } } });
    mocks.clean.mockResolvedValue({
      display: 'Call me at [PHONE]', original: 'Call me at [PHONE]',
      hadProfanity: false, hadSlur: false, hadPII: true, severity: 'low',
    });
    mocks.answer.mockResolvedValue({
      answer: 'Here is a local FAQ match.', kbMatched: true, canEscalate: false,
      usedKb: [], mode: 'keyword', piiDetected: true, language: 'en',
    });

    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'victim-session', question: 'Call me at 012-3456789' }),
    }));
    const body = await response.json();

    expect(mocks.answer).toHaveBeenCalledWith('Call me at [PHONE]', false);
    expect(body.data.privacyBlocked).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), answer: vi.fn(), clean: vi.fn() }));
function query(result: unknown) {
  const terminal = Promise.resolve(result);
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'insert']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.single = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return builder;
}
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/chatbot/answer', () => ({ answerQuestion: mocks.answer }));
vi.mock('@/lib/moderation/clean', () => ({ cleanUserContent: mocks.clean }));
vi.mock('@/lib/moderation/flags', () => ({ logModerationFlag: vi.fn() }));

import { POST } from '../route';

describe('POST /api/chatbot/ask session ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'attacker' } } });
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

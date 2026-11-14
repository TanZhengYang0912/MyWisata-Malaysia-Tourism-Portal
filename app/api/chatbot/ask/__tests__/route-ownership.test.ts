import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({ createAuthClient: vi.fn(), getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), answer: vi.fn(), clean: vi.fn(), reserveQuota: vi.fn(), guestCredential: vi.fn(), tokenHash: vi.fn(), bindGuest: vi.fn(), messageInserts: [] as unknown[] }));
function query(result: unknown) {
  const terminal = Promise.resolve(result);
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'insert', 'limit']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.single = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return builder;
}
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createAuthClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/lib/chatbot/answer', () => ({ answerQuestion: mocks.answer }));
vi.mock('@/lib/moderation/clean', () => ({ cleanUserContent: mocks.clean }));
vi.mock('@/lib/moderation/flags', () => ({ logModerationFlag: vi.fn() }));
vi.mock('@/lib/rate-limit/ai', () => ({ reserveAiQuota: mocks.reserveQuota }));
vi.mock('@/lib/chatbot/guest-session', () => ({
  readChatbotGuestCredential: mocks.guestCredential,
  hashChatbotGuestCredential: mocks.tokenHash,
  bindChatbotGuestSessionToken: mocks.bindGuest,
}));

import { POST } from '../route';

describe('POST /api/chatbot/ask session ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.messageInserts.length = 0;
    mocks.createAuthClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'attacker' } } });
    let messageQuery = 0;
    mocks.reserveQuota.mockResolvedValue(false);
    mocks.guestCredential.mockReturnValue('a'.repeat(43));
    mocks.tokenHash.mockReturnValue('b'.repeat(64));
    mocks.bindGuest.mockResolvedValue('bound');
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'reserve_support_operation') return Promise.resolve({
        data: { state: 'running', shouldExecute: true, leaseToken: 'lease-token' }, error: null,
      });
      if (name === 'mark_support_operation_external_started') return Promise.resolve({ data: true, error: null });
      if (name === 'complete_chatbot_ask_operation_with_evidence') return Promise.resolve({ data: 'bot-message-1', error: null });
      return Promise.resolve({ data: true, error: null });
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'chatbot_sessions') return query({
        data: { id: 'session-1', session_key: 'victim-session', user_id: 'victim', guest_token_hash: null, channel: 'customer' }, error: null,
      });
      if (table === 'chatbot_message_kb_refs') return query({ data: [], error: null });
      messageQuery += 1;
      const result = messageQuery === 1
        ? { data: null, error: null }
        : messageQuery === 2
          ? { data: { id: 'user-message-1' }, error: null }
          : { data: { id: 'bot-message-1' }, error: null };
      const builder = query(result);
      builder.insert.mockImplementation((values: unknown) => {
        mocks.messageInserts.push(values);
        return builder;
      });
      return builder;
    });
  });

  it('does not append a conversation to another account session', async () => {
    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'victim-session', operationId: crypto.randomUUID(), question: 'Where is my booking?' }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.answer).not.toHaveBeenCalled();
    expect(mocks.clean).not.toHaveBeenCalled();
  });

  it('does not append a customer message to an admin AI session', async () => {
    const sessionQuery = query({ data: {
      id: 'admin-session', session_key: 'admin-session', user_id: 'attacker', guest_token_hash: null, channel: 'admin',
    }, error: null });
    mocks.from.mockReturnValue(sessionQuery);

    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'admin-session', operationId: crypto.randomUUID(), question: 'How can I contact support?' }),
    }));

    expect(response.status).toBe(403);
    expect(sessionQuery.eq).toHaveBeenCalledWith('channel', 'customer');
    expect(mocks.clean).not.toHaveBeenCalled();
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it('does not treat an authentication service outage as an anonymous guest', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', status: 503 },
    });
    mocks.guestCredential.mockReturnValue(null);

    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operationId: crypto.randomUUID(), question: 'How do I change my profile?' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('AUTH_UNAVAILABLE');
    expect(mocks.guestCredential).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.clean).not.toHaveBeenCalled();
    expect(mocks.reserveQuota).not.toHaveBeenCalled();
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it('returns a retryable auth failure when the server auth client cannot be created', async () => {
    mocks.createAuthClient.mockRejectedValue(new Error('server auth client unavailable'));

    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operationId: crypto.randomUUID(), question: 'How do I change my profile?' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('AUTH_UNAVAILABLE');
    expect(mocks.guestCredential).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it('passes a per-provider quota reservation callback into the answer pipeline', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'victim' } } });
    mocks.clean.mockResolvedValue({
      display: 'How do I check my booking?', original: 'How do I check my booking?',
      hadProfanity: false, hadSlur: false, hadPII: false, severity: 'low',
    });
    mocks.reserveQuota.mockResolvedValue(true);
    mocks.answer.mockImplementation(async (_question, _useAi, _markExternalCall, reserveProviderCall) => {
      expect(reserveProviderCall).toBeTypeOf('function');
      await reserveProviderCall?.();
      await reserveProviderCall?.();
      return {
        answer: 'Check your booking page.', kbMatched: true, canEscalate: false,
        usedKb: [], mode: 'llm', piiDetected: false, language: 'en',
      };
    });

    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'victim-session', operationId: crypto.randomUUID(), question: 'How do I check my booking?' }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.reserveQuota).toHaveBeenCalledTimes(2);
    expect(mocks.reserveQuota).toHaveBeenCalledWith(expect.any(Request), 'chatbot', 'victim');
  });

  it('rejects unauthenticated bot requests before establishing a session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'guest-session', operationId: crypto.randomUUID(), question: 'Where is my booking?' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.clean).not.toHaveBeenCalled();
    expect(mocks.answer).not.toHaveBeenCalled();
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
      body: JSON.stringify({ sessionKey: 'victim-session', operationId: crypto.randomUUID(), question: 'Call me at 012-3456789' }),
    }));
    const body = await response.json();

    expect(mocks.answer).toHaveBeenCalledWith('Call me at [PHONE]', false);
    expect(body.data.privacyBlocked).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('complete_chatbot_ask_operation_with_evidence', expect.objectContaining({
      p_operation_id: expect.any(String),
      p_actor_key: 'user:victim',
      p_user_message_id: 'user-message-1',
    }));
    expect(mocks.messageInserts[0]).toEqual(expect.objectContaining({ body: 'Call me at [PHONE]', body_sanitized: true }));
  });

  it('marks the stored question as sanitized only after server-side cleaning', async () => {
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
      body: JSON.stringify({ sessionKey: 'victim-session', operationId: crypto.randomUUID(), question: 'Call me at 012-3456789' }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.messageInserts[0]).toEqual(expect.objectContaining({ body: 'Call me at [PHONE]', body_sanitized: true }));
  });

  it('commits reference snapshots with the answer and exposes only safe citation fields', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'victim' } } });
    mocks.clean.mockResolvedValue({
      display: 'How are refunds handled?', original: 'How are refunds handled?',
      hadProfanity: false, hadSlur: false, hadPII: false, severity: 'low',
    });
    mocks.answer.mockResolvedValue({
      answer: 'Contact Support to request a refund.', kbMatched: true, canEscalate: false,
      usedKb: [{ id: 'internal-document-id', title: 'Refund policy', contentVersion: 6, similarity: 0.91 }],
      mode: 'llm', piiDetected: false, language: 'en',
    });

    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'victim-session', operationId: crypto.randomUUID(), question: 'How are refunds handled?' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('complete_chatbot_ask_operation_with_evidence', expect.objectContaining({
      p_kb_refs: [{ documentId: 'internal-document-id', title: 'Refund policy', contentVersion: 6, score: 0.91 }],
    }));
    expect(body.data.evidence).toEqual([expect.objectContaining({ title: 'Refund policy', contentVersion: 6 })]);
    expect(body.data.evidence[0]).not.toHaveProperty('documentId');
    expect(body.data.evidence[0]).not.toHaveProperty('body');
  });

  it('returns the stored answer for a repeated operation without calling the model again', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'victim' } } });
    mocks.clean.mockResolvedValue({
      display: 'Where is my booking?', original: 'Where is my booking?',
      hadProfanity: false, hadSlur: false, hadPII: false, severity: 'low',
    });
    const operationId = crypto.randomUUID();
    const sessionId = 'session-1';
    const payloadHash = createHash('sha256')
      .update(JSON.stringify({ sessionId, userId: 'victim', question: 'Where is my booking?' }))
      .digest('hex');
    let messageQuery = 0;
    mocks.from.mockImplementation((table: string) => {
      if (table === 'chatbot_sessions') return query({
        data: { id: sessionId, session_key: 'victim-session', user_id: 'victim', guest_token_hash: null, channel: 'customer' }, error: null,
      });
      if (table === 'chatbot_message_kb_refs') return query({ data: [], error: null });
      messageQuery += 1;
      return query(messageQuery === 1
        ? { data: { id: 'user-message-1', operation_payload_hash: payloadHash }, error: null }
        : { data: { id: 'bot-message-1', body: 'Your booking is confirmed.', kb_matched: true, answer_language: 'en', privacy_blocked: false }, error: null });
    });

    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'victim-session', operationId, question: 'Where is my booking?' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.answer).toBe('Your booking is confirmed.');
    expect(mocks.answer).not.toHaveBeenCalled();
    expect(mocks.reserveQuota).not.toHaveBeenCalled();
  });

  it('does not call the answer pipeline when another request holds the operation lease', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'victim' } } });
    mocks.rpc.mockResolvedValueOnce({ data: { state: 'running', shouldExecute: false }, error: null });

    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'victim-session', operationId: crypto.randomUUID(), question: 'Where is my booking?' }),
    }));

    expect(response.status).toBe(409);
    expect(mocks.answer).not.toHaveBeenCalled();
    expect(mocks.reserveQuota).not.toHaveBeenCalled();
  });

  it('reuses the saved user turn when an unstarted lease is recovered', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'victim' } } });
    mocks.clean.mockResolvedValue({
      display: 'Where is my booking?', original: 'Where is my booking?',
      hadProfanity: false, hadSlur: false, hadPII: false, severity: 'low',
    });
    mocks.answer.mockResolvedValue({
      answer: 'Check your booking page.', kbMatched: true, canEscalate: false,
      usedKb: [], mode: 'keyword', piiDetected: false, language: 'en',
    });
    mocks.rpc.mockImplementation((name: string) => name === 'reserve_support_operation'
      ? Promise.resolve({ data: { state: 'running', shouldExecute: true, leaseToken: 'recovered-lease', created: false }, error: null })
      : name === 'complete_chatbot_ask_operation_with_evidence'
        ? Promise.resolve({ data: 'bot-message-1', error: null })
        : Promise.resolve({ data: true, error: null }));
    let messageQuery = 0;
    mocks.from.mockImplementation((table: string) => {
      if (table === 'chatbot_sessions') return query({
        data: { id: 'session-1', session_key: 'victim-session', user_id: 'victim', guest_token_hash: null, channel: 'customer' }, error: null,
      });
      if (table === 'chatbot_message_kb_refs') return query({ data: [], error: null });
      messageQuery += 1;
      return query(messageQuery === 1
        ? { data: { id: 'saved-user-message', operation_payload_hash: createHash('sha256').update(JSON.stringify({ sessionId: 'session-1', userId: 'victim', question: 'Where is my booking?' })).digest('hex') }, error: null }
        : { data: null, error: null });
    });

    const operationId = crypto.randomUUID();
    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'victim-session', operationId, question: 'Where is my booking?' }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('complete_chatbot_ask_operation_with_evidence', expect.objectContaining({
      p_user_message_id: 'saved-user-message',
    }));
  });

  it('reuses a competing saved user turn after an expired lease races on insert', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'victim' } } });
    mocks.clean.mockResolvedValue({
      display: 'Where is my booking?', original: 'Where is my booking?',
      hadProfanity: false, hadSlur: false, hadPII: false, severity: 'low',
    });
    mocks.answer.mockResolvedValue({
      answer: 'Check your booking page.', kbMatched: true, canEscalate: false,
      usedKb: [], mode: 'keyword', piiDetected: false, language: 'en',
    });
    mocks.rpc.mockImplementation((name: string) => name === 'reserve_support_operation'
      ? Promise.resolve({ data: { state: 'running', shouldExecute: true, leaseToken: 'recovered-lease', created: false }, error: null })
      : name === 'complete_chatbot_ask_operation_with_evidence'
        ? Promise.resolve({ data: 'bot-message-1', error: null })
        : Promise.resolve({ data: true, error: null }));
    const payloadHash = createHash('sha256').update(JSON.stringify({
      sessionId: 'session-1', userId: 'victim', question: 'Where is my booking?',
    })).digest('hex');
    let messageQuery = 0;
    mocks.from.mockImplementation((table: string) => {
      if (table === 'chatbot_sessions') return query({
        data: { id: 'session-1', session_key: 'victim-session', user_id: 'victim', guest_token_hash: null, channel: 'customer' }, error: null,
      });
      if (table === 'chatbot_message_kb_refs') return query({ data: [], error: null });
      messageQuery += 1;
      const results = [
        { data: null, error: null },
        { data: null, error: { code: '23505' } },
        { data: { id: 'competing-user-message', operation_payload_hash: payloadHash }, error: null },
        { data: null, error: null },
      ];
      return query(results[messageQuery - 1] ?? { data: null, error: null });
    });

    const response = await POST(new Request('http://localhost/api/chatbot/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'victim-session', operationId: crypto.randomUUID(), question: 'Where is my booking?' }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('complete_chatbot_ask_operation_with_evidence', expect.objectContaining({
      p_user_message_id: 'competing-user-message',
    }));
    expect(mocks.rpc).not.toHaveBeenCalledWith('mark_support_operation_unknown', expect.anything());
  });
});

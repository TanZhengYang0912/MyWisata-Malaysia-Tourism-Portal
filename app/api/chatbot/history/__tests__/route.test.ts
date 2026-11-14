import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createAuthClient: vi.fn(), getUser: vi.fn(), createServiceClient: vi.fn(), guestCredential: vi.fn(), tokenHash: vi.fn(), bindGuest: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createAuthClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/chatbot/guest-session', () => ({
  readChatbotGuestCredential: mocks.guestCredential,
  hashChatbotGuestCredential: mocks.tokenHash,
  bindChatbotGuestSessionToken: mocks.bindGuest,
}));

import { POST } from '../route';

function makeBuilder(result: unknown, resolveAt: 'in' | 'limit' | 'maybeSingle' = 'limit') {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  builder.is = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.or = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.then = (...args: unknown[]) => {
    const onFulfilled = args[0];
    const onRejected = args[1];
    return Promise.resolve(result).then(
      typeof onFulfilled === 'function' ? (value) => onFulfilled(value) : undefined,
      typeof onRejected === 'function' ? (reason) => onRejected(reason) : undefined,
    );
  };
  builder.maybeSingle = () => resolveAt === 'maybeSingle' ? Promise.resolve(result) : builder;
  return builder;
}

function makeRequest() {
  return new Request('http://localhost/api/chatbot/history', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionKey: 'session-1' }),
  });
}

describe('POST /api/chatbot/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
    mocks.guestCredential.mockReturnValue('a'.repeat(43));
    mocks.tokenHash.mockReturnValue('b'.repeat(64));
    mocks.bindGuest.mockResolvedValue('bound');
  });

  it('returns only the owned customer session and bounded message batch', async () => {
    const messages = [
      { id: '22222222-2222-4222-8222-222222222222', role: 'bot', body: 'Check your booking page.', kb_matched: true, reply_to_message_id: '11111111-1111-4111-8111-111111111111', created_at: '2026-11-11T00:00:01Z', recommendation_data: { kind: 'results', products: [{ id: 'product-1' }] } },
      { id: '11111111-1111-4111-8111-111111111111', role: 'user', body: 'Where is my booking?', kb_matched: null, reply_to_message_id: null, created_at: '2026-11-11T00:00:00Z' },
    ];
    const session = makeBuilder({ data: { id: 'session-row-1' }, error: null }, 'maybeSingle');
    const messageQuery = makeBuilder({ data: messages, error: null });
    const feedback = makeBuilder({ data: [{ message_id: '22222222-2222-4222-8222-222222222222', helpful: null, opened_ticket: false }], error: null }, 'in');
    const evidence = makeBuilder({ data: [{
      message_id: '22222222-2222-4222-8222-222222222222', document_title_snapshot: 'Refund policy', content_version: 4, created_at: '2026-11-11T00:00:01Z',
    }], error: null }, 'in');
    const tables: Record<string, unknown> = { chatbot_sessions: session, chatbot_messages: messageQuery, chatbot_feedback: feedback, chatbot_message_kb_refs: evidence };
    mocks.createServiceClient.mockReturnValue({ from: (table: string) => tables[table] });

    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.messages[1]).toMatchObject({ question: 'Where is my booking?', feedbackStage: 'awaiting_helpful' });
    expect(payload.data.messages[1].evidence).toEqual([{ title: 'Refund policy', contentVersion: 4, checkedAt: '2026-11-11T00:00:01Z' }]);
    expect(payload.data.messages[1].recommendationData).toEqual({ kind: 'results', products: [{ id: 'product-1' }] });
    expect(evidence.limit).toHaveBeenCalledWith(180);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('does not query message rows when the session is not owned', async () => {
    const session = makeBuilder({ data: null, error: null }, 'maybeSingle');
    const from = vi.fn(() => session);
    mocks.createServiceClient.mockReturnValue({ from });

    const response = await POST(makeRequest());

    expect(response.status).toBe(404);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('returns a retryable auth failure instead of an expired guest-session response', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', status: 503 },
    });
    mocks.guestCredential.mockReturnValue(null);

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('AUTH_UNAVAILABLE');
    expect(mocks.guestCredential).not.toHaveBeenCalled();
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('returns a retryable auth failure when the server auth client cannot be created', async () => {
    mocks.createAuthClient.mockRejectedValue(new Error('server auth client unavailable'));

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('AUTH_UNAVAILABLE');
    expect(mocks.guestCredential).not.toHaveBeenCalled();
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('requires sign-in before reading a legacy guest conversation', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.bindGuest.mockResolvedValue('unavailable');

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('does not restore a guest conversation for an anonymous caller', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('UNAUTHORIZED');
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('requires authentication before checking any chat session key', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });
});

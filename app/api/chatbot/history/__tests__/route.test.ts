import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));

import { POST } from '../route';

function makeBuilder(result: unknown, resolveAt: 'in' | 'limit' | 'maybeSingle' = 'limit') {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.in = () => resolveAt === 'in' ? Promise.resolve(result) : builder;
  builder.or = () => builder;
  builder.order = () => builder;
  builder.limit = () => resolveAt === 'limit' ? Promise.resolve(result) : builder;
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
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
  });

  it('returns only the owned customer session and bounded message batch', async () => {
    const messages = [
      { id: '22222222-2222-4222-8222-222222222222', role: 'bot', body: 'Check your booking page.', kb_matched: true, reply_to_message_id: '11111111-1111-4111-8111-111111111111', created_at: '2026-11-11T00:00:01Z' },
      { id: '11111111-1111-4111-8111-111111111111', role: 'user', body: 'Where is my booking?', kb_matched: null, reply_to_message_id: null, created_at: '2026-11-11T00:00:00Z' },
    ];
    const session = makeBuilder({ data: { id: 'session-row-1' }, error: null }, 'maybeSingle');
    const messageQuery = makeBuilder({ data: messages, error: null });
    const feedback = makeBuilder({ data: [{ message_id: '22222222-2222-4222-8222-222222222222', helpful: null, opened_ticket: false }], error: null }, 'in');
    const tables: Record<string, unknown> = { chatbot_sessions: session, chatbot_messages: messageQuery, chatbot_feedback: feedback };
    mocks.createServiceClient.mockReturnValue({ from: (table: string) => tables[table] });

    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.messages[1]).toMatchObject({ question: 'Where is my booking?', feedbackStage: 'awaiting_helpful' });
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
});

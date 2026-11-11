import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ clean: vi.fn(), getUser: vi.fn(), createServiceClient: vi.fn(), createToken: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/moderation/clean', () => ({ cleanUserContent: mocks.clean }));
vi.mock('@/lib/support/handoff-token', () => ({ createHandoffToken: mocks.createToken }));

import { POST } from '../route';

function request(subject: unknown, summary: unknown, extra: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/support/handoff/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject, summary, ...extra }),
  });
}

describe('POST /api/support/handoff/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-handoff-secret');
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
    mocks.clean.mockImplementation(async (text: string) => ({ display: text.replace('012-3456789', '[PHONE]') }));
    mocks.createServiceClient.mockReturnValue({});
    mocks.createToken.mockResolvedValue('opaque-token');
  });

  it('returns the exact cleaned title and summary without creating a ticket', async () => {
    const response = await POST(request('Help 012-3456789', 'My booking is missing. Call 012-3456789'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { subject: 'Help [PHONE]', summary: 'My booking is missing. Call [PHONE]', handoffToken: expect.any(String) },
    });
    expect(mocks.clean).toHaveBeenCalledTimes(2);
  });

  it('rejects missing or oversized preview content before moderation', async () => {
    expect((await POST(request('', 'summary'))).status).toBe(422);
    expect((await POST(request('x', 'y'.repeat(2001)))).status).toBe(422);
    expect(mocks.clean).not.toHaveBeenCalled();
  });

  it('rejects a selected conversation owned by another account', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: { id: 'session-1', user_id: 'another-owner' }, error: null })),
    };
    mocks.createServiceClient.mockReturnValue({ from: () => query });

    const response = await POST(request('Help', 'My question', {
      sessionKey: 'session-secret',
      messageId: '33333333-3333-4333-8333-333333333333',
    }));

    expect(response.status).toBe(403);
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.clean).not.toHaveBeenCalled();
  });

  it('binds the signed preview token to the verified source message', async () => {
    const sessionQuery = {
      select: vi.fn(() => sessionQuery),
      eq: vi.fn(() => sessionQuery),
      maybeSingle: vi.fn(async () => ({ data: { id: 'session-1', user_id: 'owner-1' }, error: null })),
    };
    const messageResults = [
      { id: '33333333-3333-4333-8333-333333333333', reply_to_message_id: '44444444-4444-4444-8444-444444444444' },
      { id: '44444444-4444-4444-8444-444444444444' },
    ];
    const messagesQuery = {
      select: vi.fn(() => messagesQuery),
      eq: vi.fn(() => messagesQuery),
      maybeSingle: vi.fn(async () => ({ data: messageResults.shift(), error: null })),
    };
    mocks.createServiceClient.mockReturnValue({ from: (table: string) => table === 'chatbot_sessions' ? sessionQuery : messagesQuery });

    const response = await POST(request('Help', 'My question', {
      sessionKey: 'session-secret',
      messageId: '33333333-3333-4333-8333-333333333333',
    }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data.sourceMessageId).toBe('33333333-3333-4333-8333-333333333333');
    expect(payload.data.handoffToken).toBe('opaque-token');
    expect(mocks.createToken).toHaveBeenCalledWith('owner-1', 'Help', 'My question', '33333333-3333-4333-8333-333333333333');
    expect(messagesQuery.maybeSingle).toHaveBeenCalledTimes(2);
  });
});

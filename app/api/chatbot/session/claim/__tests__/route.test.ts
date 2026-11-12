import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createAuthClient: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), sameOrigin: vi.fn(), guestCredential: vi.fn(), tokenHash: vi.fn(), clearCookie: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createAuthClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/checkout/guest-session', () => ({ isSameOriginMutation: mocks.sameOrigin }));
vi.mock('@/lib/chatbot/guest-session', () => ({
  readChatbotGuestCredential: mocks.guestCredential,
  hashChatbotGuestCredential: mocks.tokenHash,
  clearChatbotGuestCookie: mocks.clearCookie,
}));

import { POST } from '../route';

function makeRequest(sessionKey = 'guest-session-key') {
  return new Request('http://localhost/api/chatbot/session/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ sessionKey }),
  });
}

describe('POST /api/chatbot/session/claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'account-1' } } });
    mocks.guestCredential.mockReturnValue('a'.repeat(43));
    mocks.tokenHash.mockReturnValue('b'.repeat(64));
    mocks.rpc.mockResolvedValue({ data: { session_key: 'guest-session-key', already_owned: false }, error: null });
  });

  it('claims only the submitted guest key for the authenticated account', async () => {
    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_chatbot_guest_session', {
      p_session_key: 'guest-session-key', p_user_id: 'account-1', p_guest_token_hash: 'b'.repeat(64),
    });
    expect(payload.data.sessionKey).toBe('guest-session-key');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.clearCookie).toHaveBeenCalled();
  });

  it('rejects a request that does not match the app origin', async () => {
    mocks.sameOrigin.mockReturnValue(false);

    const response = await POST(makeRequest());

    expect(response.status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not claim a session for an anonymous caller', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns a retryable auth error instead of treating an auth outage as expired login', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 503 } });

    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('AUTH_UNAVAILABLE');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('maps a session claimed by another account without exposing database details', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'chatbot_guest_session_conflict' } });

    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('OPERATION_CONFLICT');
    expect(payload.error.message).not.toContain('chatbot_guest_session_conflict');
  });
});

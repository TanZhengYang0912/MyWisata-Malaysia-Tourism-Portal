import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createAuthClient: vi.fn(), getUser: vi.fn(), sameOrigin: vi.fn(), readCredential: vi.fn(), newCredential: vi.fn(), setCookie: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), bind: vi.fn(), hash: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createAuthClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: () => ({ select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle }) }) }));
vi.mock('@/lib/checkout/guest-session', () => ({ isSameOriginMutation: mocks.sameOrigin }));
vi.mock('@/lib/chatbot/guest-session', () => ({
  bindChatbotGuestSessionToken: mocks.bind,
  hashChatbotGuestCredential: mocks.hash,
  readChatbotGuestCredential: mocks.readCredential,
  newChatbotGuestCredential: mocks.newCredential,
  setChatbotGuestCookie: mocks.setCookie,
}));

import { POST } from '../route';

function makeRequest() {
  return new Request('http://localhost/api/chatbot/session/guest-token', {
    method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
}

describe('POST /api/chatbot/session/guest-token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.readCredential.mockReturnValue(null);
    mocks.newCredential.mockReturnValue('g'.repeat(43));
    mocks.select.mockReturnThis();
    mocks.eq.mockReturnThis();
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.hash.mockReturnValue('h'.repeat(64));
    mocks.bind.mockResolvedValue('bound');
  });

  it('rejects a guest before issuing a chatbot credential', async () => {
    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('UNAUTHORIZED');
    expect(JSON.stringify(payload)).not.toContain('g'.repeat(43));
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it('does not reuse a guest credential for an anonymous request', async () => {
    mocks.readCredential.mockReturnValue('p'.repeat(43));

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mocks.newCredential).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it('does not issue a guest credential to a signed-in user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(payload.data).toEqual({ ready: true, guest: false });
    expect(mocks.newCredential).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it('does not issue a guest credential while the auth service is unavailable', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 503 } });

    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('AUTH_UNAVAILABLE');
    expect(mocks.newCredential).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it('does not inspect an old guest session for an anonymous request', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { user_id: null, channel: 'customer', guest_token_hash: 'x'.repeat(64) }, error: null });
    const request = new Request('http://localhost/api/chatbot/session/guest-token', {
      method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'old-session' }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('UNAUTHORIZED');
    expect(mocks.setCookie).not.toHaveBeenCalled();
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });

  it('does not bind a legacy guest session without sign-in', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { user_id: null, channel: 'customer', guest_token_hash: null }, error: null });
    const request = new Request('http://localhost/api/chatbot/session/guest-token', {
      method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'legacy-session' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(mocks.bind).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it('does not attempt guest credential binding when unauthenticated', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { user_id: null, channel: 'customer', guest_token_hash: null }, error: null });
    mocks.bind.mockResolvedValue('unavailable');
    const request = new Request('http://localhost/api/chatbot/session/guest-token', {
      method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'legacy-session' }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('UNAUTHORIZED');
    expect(mocks.bind).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
});

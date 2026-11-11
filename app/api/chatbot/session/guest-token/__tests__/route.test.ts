import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), sameOrigin: vi.fn(), readCredential: vi.fn(), newCredential: vi.fn(), setCookie: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), bind: vi.fn(), hash: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
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
    mocks.sameOrigin.mockReturnValue(true);
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.readCredential.mockReturnValue(null);
    mocks.newCredential.mockReturnValue('g'.repeat(43));
    mocks.select.mockReturnThis();
    mocks.eq.mockReturnThis();
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.hash.mockReturnValue('h'.repeat(64));
    mocks.bind.mockResolvedValue(true);
  });

  it('sets a server-generated HttpOnly credential without returning its value', async () => {
    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ ready: true, guest: true });
    expect(JSON.stringify(payload)).not.toContain('g'.repeat(43));
    expect(mocks.setCookie).toHaveBeenCalledWith(expect.anything(), 'g'.repeat(43));
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('reuses an existing credential without rotating it', async () => {
    mocks.readCredential.mockReturnValue('p'.repeat(43));

    await POST(makeRequest());

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

  it('does not silently replace a lost credential for an already bound session', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { user_id: null, channel: 'customer', guest_token_hash: 'x'.repeat(64) }, error: null });
    const request = new Request('http://localhost/api/chatbot/session/guest-token', {
      method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'old-session' }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('GUEST_SESSION_REQUIRED');
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it('binds a newly issued credential to an unbound legacy session before setting its cookie', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { user_id: null, channel: 'customer', guest_token_hash: null }, error: null });
    const request = new Request('http://localhost/api/chatbot/session/guest-token', {
      method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'legacy-session' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.bind).toHaveBeenCalledWith('legacy-session', 'h'.repeat(64));
    expect(mocks.setCookie).toHaveBeenCalled();
  });
});

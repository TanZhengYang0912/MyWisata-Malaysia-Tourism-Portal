import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  resolve: vi.fn(),
  signInWithOtp: vi.fn(),
  profileExists: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/recommendations/vendor-invite-access', () => ({ resolveActiveVendorInvite: mocks.resolve }));

import { POST } from '@/app/api/vendor-invite/auth/email/send/route';

function request(body: unknown) {
  return new Request('http://localhost/api/vendor-invite/auth/email/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/vendor-invite/auth/email/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profileExists.mockResolvedValue({ data: false, error: null });
    mocks.createServiceClient.mockReturnValue({ service: true, rpc: mocks.profileExists });
    mocks.createClient.mockResolvedValue({ auth: { signInWithOtp: mocks.signInWithOtp } });
    mocks.resolve.mockResolvedValue({ ok: true, invite: { recommendationId: 'rec-1', email: 'owner@example.com' } });
    mocks.signInWithOtp.mockResolvedValue({ error: null });
  });

  it('sends an OTP only to the server-resolved invitation email', async () => {
    const inviteRequest = request({ token: 'valid-invite-token-value', captchaToken: 'valid-proof' });
    inviteRequest.headers.set('cookie', 'NEXT_LOCALE=zh-CN');
    const response = await POST(inviteRequest);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'owner@example.com',
      options: { shouldCreateUser: true, captchaToken: 'valid-proof', data: { preferred_locale: 'zh-CN' } },
    });
    expect(body).toEqual({ data: { sent: true }, error: null });
    expect(JSON.stringify(body)).not.toContain('owner@example.com');
  });

  it('does not replace an existing profile preference with the current browser language', async () => {
    mocks.profileExists.mockResolvedValue({ data: true, error: null });
    const inviteRequest = request({ token: 'valid-invite-token-value', captchaToken: 'valid-proof' });
    inviteRequest.headers.set('cookie', 'NEXT_LOCALE=ms');

    const response = await POST(inviteRequest);

    expect(response.status).toBe(200);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'owner@example.com',
      options: { shouldCreateUser: false, captchaToken: 'valid-proof' },
    });
  });

  it('uses the normalized profile lookup so historical mixed-case addresses are treated as existing accounts', async () => {
    mocks.resolve.mockResolvedValue({ ok: true, invite: { recommendationId: 'rec-1', email: 'Owner@Example.com' } });
    mocks.profileExists.mockResolvedValue({ data: true, error: null });
    const inviteRequest = request({ token: 'valid-invite-token-value', captchaToken: 'valid-proof' });
    inviteRequest.headers.set('cookie', 'NEXT_LOCALE=ms');

    const response = await POST(inviteRequest);

    expect(response.status).toBe(200);
    expect(mocks.profileExists).toHaveBeenCalledWith('profile_email_exists', { p_email: 'owner@example.com' });
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'Owner@Example.com',
      options: { shouldCreateUser: false, captchaToken: 'valid-proof' },
    });
  });

  it.each([
    ['NEXT_LOCALE=ms', 'ms'],
    ['NEXT_LOCALE=invalid', 'en'],
    ['', 'en'],
  ])('uses validated cookie locale %s for a new invited user', async (cookie, locale) => {
    const inviteRequest = request({ token: 'valid-invite-token-value', captchaToken: 'valid-proof' });
    if (cookie) inviteRequest.headers.set('cookie', cookie);
    const response = await POST(inviteRequest);

    expect(response.status).toBe(200);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'owner@example.com',
      options: { shouldCreateUser: true, captchaToken: 'valid-proof', data: { preferred_locale: locale } },
    });
  });

  it('fails closed if the exact profile lookup fails', async () => {
    mocks.profileExists.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });

    const response = await POST(request({ token: 'valid-invite-token-value', captchaToken: 'valid-proof' }));

    expect(response.status).toBe(502);
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain('database unavailable');
  });

  it('rejects a direct send without a CAPTCHA token before contacting Auth', async () => {
    const response = await POST(request({ token: 'valid-invite-token-value' }));
    expect(response.status).toBe(422);
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('rejects an otherwise-valid payload containing a client email', async () => {
    const response = await POST(request({ token: 'valid-invite-token-value', captchaToken: 'valid-proof', email: 'attacker@example.com' }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it('passes expired invitation errors through unchanged', async () => {
    mocks.resolve.mockResolvedValue({ ok: false, error: { code: 'INVITE_EXPIRED', message: 'This vendor invitation has expired.', status: 409 } });

    const response = await POST(request({ token: 'valid-invite-token-value', captchaToken: 'valid-proof' }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVITE_EXPIRED' } });
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it('maps provider rate limits to OTP_RATE_LIMITED without leaking provider details', async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', message: 'raw provider rate-limit detail', status: 429 } });

    const response = await POST(request({ token: 'valid-invite-token-value', captchaToken: 'valid-proof' }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toMatchObject({ error: { code: 'OTP_RATE_LIMITED' } });
    expect(JSON.stringify(body)).not.toContain('raw provider rate-limit detail');
    expect(JSON.stringify(body)).not.toContain('owner@example.com');
  });
});

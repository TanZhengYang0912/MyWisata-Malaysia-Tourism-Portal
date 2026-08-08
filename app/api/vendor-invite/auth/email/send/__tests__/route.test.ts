import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  resolve: vi.fn(),
  signInWithOtp: vi.fn(),
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
    mocks.createServiceClient.mockReturnValue({ service: true });
    mocks.createClient.mockResolvedValue({ auth: { signInWithOtp: mocks.signInWithOtp } });
    mocks.resolve.mockResolvedValue({ ok: true, invite: { recommendationId: 'rec-1', email: 'owner@example.com' } });
    mocks.signInWithOtp.mockResolvedValue({ error: null });
  });

  it('sends an OTP only to the server-resolved invitation email', async () => {
    const response = await POST(request({ token: 'valid-invite-token-value' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'owner@example.com',
      options: { shouldCreateUser: true },
    });
    expect(body).toEqual({ data: { sent: true }, error: null });
    expect(JSON.stringify(body)).not.toContain('owner@example.com');
  });

  it('rejects invalid payloads without resolving an invitation', async () => {
    const response = await POST(request({ token: 'short', email: 'attacker@example.com' }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it('passes expired invitation errors through unchanged', async () => {
    mocks.resolve.mockResolvedValue({ ok: false, error: { code: 'INVITE_EXPIRED', message: 'This vendor invitation has expired.', status: 409 } });

    const response = await POST(request({ token: 'valid-invite-token-value' }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVITE_EXPIRED' } });
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it('maps provider rate limits to OTP_RATE_LIMITED without leaking provider details', async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', message: 'raw provider rate-limit detail', status: 429 } });

    const response = await POST(request({ token: 'valid-invite-token-value' }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toMatchObject({ error: { code: 'OTP_RATE_LIMITED' } });
    expect(JSON.stringify(body)).not.toContain('raw provider rate-limit detail');
    expect(JSON.stringify(body)).not.toContain('owner@example.com');
  });
});

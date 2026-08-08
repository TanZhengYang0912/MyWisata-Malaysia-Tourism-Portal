import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  resolve: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/recommendations/vendor-invite-access', () => ({ resolveActiveVendorInvite: mocks.resolve }));

import { POST } from '@/app/api/vendor-invite/auth/email/verify/route';

function request(body: unknown) {
  return new Request('http://localhost/api/vendor-invite/auth/email/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/vendor-invite/auth/email/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServiceClient.mockReturnValue({ service: true });
    mocks.createClient.mockResolvedValue({ auth: { verifyOtp: mocks.verifyOtp } });
    mocks.resolve.mockResolvedValue({ ok: true, invite: { recommendationId: 'rec-1', email: 'owner@example.com' } });
    mocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: 'access-token', refresh_token: 'refresh-token' } }, error: null });
  });

  it('verifies the code against the bound email and never accepts a client email', async () => {
    const response = await POST(request({ token: 'valid-invite-token-value', code: '123456' }));
    const body = await response.json();

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: 'owner@example.com', token: '123456', type: 'email' });
    expect(response.status).toBe(200);
    expect(body).toEqual({ data: { verified: true }, error: null });
    expect(JSON.stringify(body)).not.toContain('access-token');
    expect(JSON.stringify(body)).not.toContain('refresh-token');
    expect(JSON.stringify(body)).not.toContain('owner@example.com');
  });

  it('rejects an otherwise-valid payload containing a client email', async () => {
    const response = await POST(request({ token: 'valid-invite-token-value', code: '123456', email: 'attacker@example.com' }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('passes invalid invitation errors through unchanged', async () => {
    mocks.resolve.mockResolvedValue({ ok: false, error: { code: 'INVITE_INVALID', message: 'This invitation link is invalid.', status: 404 } });

    const response = await POST(request({ token: 'valid-invite-token-value', code: '123456' }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVITE_INVALID' } });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('maps wrong or expired OTPs to OTP_INVALID without leaking provider details', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: 'raw provider verification detail' } });

    const response = await POST(request({ token: 'valid-invite-token-value', code: '123456' }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ error: { code: 'OTP_INVALID' } });
    expect(JSON.stringify(body)).not.toContain('raw provider verification detail');
    expect(JSON.stringify(body)).not.toContain('owner@example.com');
  });
});

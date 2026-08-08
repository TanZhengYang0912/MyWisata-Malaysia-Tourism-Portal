import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  firstEq: vi.fn(),
  secondEq: vi.fn(),
  is: vi.fn(),
}));

vi.mock('@/lib/twilio', () => ({ verifyOtp: mocks.verifyOtp }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: mocks.from,
  })),
}));

import { POST } from '../route';

function request() {
  return new Request('http://localhost/api/phone/verify-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '+60177143951', code: '553600' }),
  });
}

describe('POST /api/phone/verify-otp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.firstEq });
    mocks.firstEq.mockReturnValue({ eq: mocks.secondEq });
    mocks.secondEq.mockReturnValue({ is: mocks.is });
    mocks.is.mockResolvedValue({ data: null, error: null });
  });

  it('promotes the User only after an approved OTP', async () => {
    mocks.verifyOtp.mockResolvedValue({ ok: true });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('promote_to_phone_verified', {
      p_user_id: 'user-1',
      p_phone: '+60177143951',
    });
    await expect(response.json()).resolves.toMatchObject({ data: { verified: true } });
  });

  it.each([
    ['otp_invalid', 'OTP_INVALID', 422, 'That code is invalid or has expired.'],
    ['rate_limited', 'RATE_LIMITED', 429, 'Too many verification attempts. Try again later.'],
    ['verification_unavailable', 'VERIFICATION_UNAVAILABLE', 502, 'Phone verification is temporarily unavailable.'],
  ] as const)('maps %s to a stable public response', async (providerCode, apiCode, status, message) => {
    mocks.verifyOtp.mockResolvedValue({
      ok: false,
      code: providerCode,
      message: 'Provider secret should never be returned',
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(body).toEqual({ data: null, error: { code: apiCode, message } });
    expect(JSON.stringify(body)).not.toContain('Provider secret');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

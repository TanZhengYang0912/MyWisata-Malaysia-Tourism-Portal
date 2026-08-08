import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

async function loadVerifyOtp() {
  vi.resetModules();
  return (await import('@/lib/twilio')).verifyOtp;
}

describe('Twilio Verify', () => {
  beforeEach(() => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'token');
    vi.stubEnv('TWILIO_VERIFY_SERVICE_SID', 'VAtest');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the singular VerificationCheck endpoint and accepts approved codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      Response.json({ status: 'approved' }, { status: 200 }),
    ));
    const verifyOtp = await loadVerifyOtp();

    await expect(verifyOtp('+60177143951', '553600')).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/VerificationCheck'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/VerificationChecks'), expect.anything());
  });

  it.each(['pending', 'rejected', 'canceled'])('classifies a %s verification as an invalid or expired OTP', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status }, { status: 200 })));
    const verifyOtp = await loadVerifyOtp();

    await expect(verifyOtp('+60177143951', '000000')).resolves.toEqual({ ok: false, code: 'otp_invalid' });
  });

  it('classifies Twilio 404 invalid/expired responses without preserving provider text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      Response.json({ code: 20404, message: 'Provider secret invalid lookup detail' }, { status: 404 }),
    ));
    const verifyOtp = await loadVerifyOtp();

    const result = await verifyOtp('+60177143951', '000000');
    expect(result).toEqual({ ok: false, code: 'otp_invalid' });
    expect(JSON.stringify(result)).not.toContain('Provider secret');
  });

  it('classifies Twilio rate limiting separately', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      Response.json({ code: 20429, message: 'Provider rate detail' }, { status: 429 }),
    ));
    const verifyOtp = await loadVerifyOtp();

    await expect(verifyOtp('+60177143951', '000000')).resolves.toEqual({ ok: false, code: 'rate_limited' });
  });

  it.each([401, 403, 500, 502])('classifies Twilio auth/provider %s failures as unavailable', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      Response.json({ message: 'Provider infrastructure detail' }, { status }),
    ));
    const verifyOtp = await loadVerifyOtp();

    await expect(verifyOtp('+60177143951', '000000')).resolves.toEqual({ ok: false, code: 'verification_unavailable' });
  });

  it('classifies network failures as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket contained provider detail')));
    const verifyOtp = await loadVerifyOtp();

    await expect(verifyOtp('+60177143951', '000000')).resolves.toEqual({ ok: false, code: 'verification_unavailable' });
  });

  it('classifies unconfigured credentials as unavailable without throwing', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', '');
    const verifyOtp = await loadVerifyOtp();

    await expect(verifyOtp('+60177143951', '000000')).resolves.toEqual({ ok: false, code: 'verification_unavailable' });
  });
});

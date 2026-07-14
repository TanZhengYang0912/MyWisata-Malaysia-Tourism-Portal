import 'server-only';

const ACCOUNT_SID     = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN      = process.env.TWILIO_AUTH_TOKEN;
const VERIFY_SID      = process.env.TWILIO_VERIFY_SERVICE_SID;

function twilioBase() {
  if (!ACCOUNT_SID || !AUTH_TOKEN || !VERIFY_SID) {
    throw new Error('Twilio credentials not configured');
  }
  return {
    url: `https://verify.twilio.com/v2/Services/${VERIFY_SID}`,
    auth: `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
  };
}

export type TwilioResult =
  | { ok: true }
  | { ok: false; code: 'rate_limited' | 'invalid_phone' | 'twilio_error'; message: string };

export async function sendOtp(phone: string): Promise<TwilioResult> {
  const { url, auth } = twilioBase();

  const res = await fetch(`${url}/Verifications`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: phone, Channel: 'sms' }),
  });

  if (res.ok) return { ok: true };

  const body = await res.json().catch(() => ({})) as { code?: number; message?: string };

  if (res.status === 429 || body.code === 20429) {
    return { ok: false, code: 'rate_limited', message: 'Too many OTP requests — try again later' };
  }
  if (body.code === 21211 || body.code === 21614) {
    return { ok: false, code: 'invalid_phone', message: 'Invalid or unreachable phone number' };
  }
  return { ok: false, code: 'twilio_error', message: body.message ?? 'SMS delivery failed' };
}

export async function verifyOtp(phone: string, code: string): Promise<TwilioResult> {
  const { url, auth } = twilioBase();

  const res = await fetch(`${url}/VerificationCheck`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: phone, Code: code }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    return { ok: false, code: 'twilio_error', message: body.message ?? 'Verification failed' };
  }

  const data = await res.json() as { status: string };
  if (data.status !== 'approved') {
    return { ok: false, code: 'twilio_error', message: 'Incorrect code — try again' };
  }
  return { ok: true };
}

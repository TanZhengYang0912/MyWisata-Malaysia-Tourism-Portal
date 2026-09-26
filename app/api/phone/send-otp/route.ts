import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { sendOtpSchema } from '@/lib/validation/phone-schemas';
import { sendOtp } from '@/lib/twilio';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, sendOtpSchema);
  if (!parsed.ok) return parsed.response;
  const { phone } = parsed.data;

  // Pre-send collision check: is this number already verified on another account?
  const { data: collision, error: collisionError } = await supabase.rpc('check_phone_collision', {
    p_phone:   phone,
    p_user_id: user.id,
  });
  if (collisionError) return apiFail('DB_ERROR', 'Unable to verify phone availability right now.', 503);
  if (collision) {
    return apiFail('PHONE_ALREADY_CLAIMED', 'This number is already registered to another account', 409);
  }

  // Reserve quotas under a database advisory lock. The row is the audit fact
  // used by verify-otp and the atomic RPC enforces account, phone and service caps.
  let reservation: unknown;
  let reservationError: { message?: string } | null = null;
  try {
    const result = await createServiceClient().rpc('reserve_phone_otp_send', {
      p_user_id: user.id,
      p_phone: phone,
    });
    reservation = result.data;
    reservationError = result.error;
  } catch {
    return apiFail('OTP_SEND_UNAVAILABLE', 'Phone verification is temporarily unavailable.', 503);
  }
  if (reservationError || !reservation) {
    const rateLimited = reservationError?.message?.includes('otp_rate_limited');
    return apiFail(
      rateLimited ? 'RATE_LIMITED' : 'OTP_SEND_UNAVAILABLE',
      rateLimited ? 'Too many OTP requests — try again later.' : 'Phone verification is temporarily unavailable.',
      rateLimited ? 429 : 503,
    );
  }

  // Issue OTP via Twilio Verify
  let result;
  try {
    result = await sendOtp(phone);
  } catch {
    return apiFail('OTP_PROVIDER_UNAVAILABLE', 'Phone verification is temporarily unavailable.', 502);
  }
  if (!result.ok) {
    return apiFail(result.code.toUpperCase(), result.message,
      result.code === 'rate_limited' ? 429 : result.code === 'invalid_phone' ? 422 : 502);
  }

  return apiOk({ sent: true, phone });
}

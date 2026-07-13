import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { sendOtpSchema } from '@/lib/validation/phone-schemas';
import { sendOtp } from '@/lib/twilio';

const OTP_SEND_LIMIT_PER_HOUR = 3;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, sendOtpSchema);
  if (!parsed.ok) return parsed.response;
  const { phone } = parsed.data;

  // Pre-send collision check: is this number already verified on another account?
  const { data: collision } = await supabase.rpc('check_phone_collision', {
    p_phone:   phone,
    p_user_id: user.id,
  });
  if (collision) {
    return apiFail('PHONE_ALREADY_CLAIMED', 'This number is already registered to another account', 409);
  }

  // Rate limit: max 3 sends per phone per hour (application layer)
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await supabase
    .from('phone_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', oneHourAgo);

  if ((count ?? 0) >= OTP_SEND_LIMIT_PER_HOUR) {
    return apiFail('RATE_LIMITED', 'Too many OTP requests — try again in 1 hour', 429);
  }

  // Record the send attempt before calling Twilio (idempotent on Twilio side)
  await supabase.from('phone_verifications').insert({
    user_id: user.id,
    phone,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), // 10 min
  });

  // Issue OTP via Twilio Verify
  const result = await sendOtp(phone);
  if (!result.ok) {
    return apiFail(result.code.toUpperCase(), result.message,
      result.code === 'rate_limited' ? 429 : result.code === 'invalid_phone' ? 422 : 502);
  }

  return apiOk({ sent: true, phone });
}

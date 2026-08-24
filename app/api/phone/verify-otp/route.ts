import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { verifyOtpSchema } from '@/lib/validation/phone-schemas';
import { verifyOtp } from '@/lib/twilio';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, verifyOtpSchema);
  if (!parsed.ok) return parsed.response;
  const { phone, code } = parsed.data;

  // Verify OTP via Twilio
  const result = await verifyOtp(phone, code);
  if (!result.ok) {
    if (result.code === 'otp_invalid') {
      return apiFail('OTP_INVALID', 'That code is invalid or has expired.', 422);
    }
    if (result.code === 'rate_limited') {
      return apiFail('RATE_LIMITED', 'Too many verification attempts. Try again later.', 429);
    }
    return apiFail('VERIFICATION_UNAVAILABLE', 'Phone verification is temporarily unavailable.', 502);
  }

  // Post-verify: advance tier + record verified phone (atomic, with advisory lock in RPC)
  const service = createServiceClient();
  const { error } = await service.rpc('promote_to_phone_verified', {
    p_user_id: user.id,
    p_phone:   phone,
  });

  if (error) {
    if (error.message.includes('user_not_found'))
      return apiFail('NOT_FOUND', 'User not found', 404);
    // unique_violation: phone claimed by another account between pre-send and post-verify
    if (error.message.includes('unique') || error.message.includes('duplicate'))
      return apiFail('PHONE_ALREADY_CLAIMED', 'This number was just registered to another account', 409);
    return apiFail('DB_ERROR', 'Unable to complete phone verification. Please try again later.', 500);
  }

  // Mark the phone_verifications row as verified
  await supabase
    .from('phone_verifications')
    .update({ verified_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('phone', phone)
    .is('verified_at', null);

  return apiOk({ verified: true, phone, tier: 'phone_verified' });
}

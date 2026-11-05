import { z } from 'zod';
import { resolveActiveVendorInvite } from '@/lib/recommendations/vendor-invite-access';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { normalizeEmail } from '@/lib/validation/postgrest-filter';
import { checkoutEmailLocale } from '@/lib/email/locale';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const schema = z.object({ token: z.string().trim().min(16).max(200), captchaToken: z.string().trim().min(1).max(2048) }).strict();

function isRateLimited(error: { code?: string; status?: number }) {
  return error.status === 429 || error.code === 'over_email_send_rate_limit';
}

function mapOtpSendError(error: { code?: string; status?: number }) {
  if (error.code === 'captcha_failed') return apiFail('HUMAN_VERIFICATION_FAILED', 'Complete the security check and try again.', 403);
  if (isRateLimited(error)) {
    return apiFail('OTP_RATE_LIMITED', 'Too many sign-in codes were requested. Please try again later.', 429);
  }
  return apiFail('OTP_SEND_FAILED', 'Unable to send a sign-in code. Please try again.', 502);
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const service = createServiceClient();
  const resolution = await resolveActiveVendorInvite(service, parsed.data.token);
  if (!resolution.ok) return apiFail(resolution.error.code, resolution.error.message, resolution.error.status);

  const { data: profileExists, error: profileError } = await service.rpc('profile_email_exists', {
    p_email: normalizeEmail(resolution.invite.email),
  });
  if (profileError || typeof profileExists !== 'boolean') {
    return apiFail('OTP_SEND_FAILED', 'Unable to send a sign-in code. Please try again.', 502);
  }

  const db = await createClient();
  const locale = checkoutEmailLocale(request);
  const { error } = await db.auth.signInWithOtp({
    email: resolution.invite.email,
    options: {
      shouldCreateUser: profileExists !== true,
      captchaToken: parsed.data.captchaToken,
      ...(profileExists === true ? {} : { data: { preferred_locale: locale } }),
    },
  });
  if (error) return mapOtpSendError(error);

  return apiOk({ sent: true });
}

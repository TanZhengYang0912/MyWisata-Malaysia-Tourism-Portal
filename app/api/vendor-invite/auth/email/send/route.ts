import { z } from 'zod';
import { resolveActiveVendorInvite } from '@/lib/recommendations/vendor-invite-access';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const schema = z.object({ token: z.string().trim().min(16).max(200) }).strict();

function isRateLimited(error: { code?: string; status?: number }) {
  return error.status === 429 || error.code === 'over_email_send_rate_limit';
}

function mapOtpSendError(error: { code?: string; status?: number }) {
  if (isRateLimited(error)) {
    return apiFail('OTP_RATE_LIMITED', 'Too many sign-in codes were requested. Please try again later.', 429);
  }
  return apiFail('OTP_SEND_FAILED', 'Unable to send a sign-in code. Please try again.', 502);
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const resolution = await resolveActiveVendorInvite(createServiceClient(), parsed.data.token);
  if (!resolution.ok) return apiFail(resolution.error.code, resolution.error.message, resolution.error.status);

  const db = await createClient();
  const { error } = await db.auth.signInWithOtp({
    email: resolution.invite.email,
    options: { shouldCreateUser: true },
  });
  if (error) return mapOtpSendError(error);

  return apiOk({ sent: true });
}

import { z } from 'zod';
import { resolveActiveVendorInvite } from '@/lib/recommendations/vendor-invite-access';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const schema = z.object({
  token: z.string().trim().min(16).max(200),
  code: z.string().regex(/^\d{6}$/),
}).strict();

function isRateLimited(error: { code?: string; status?: number }) {
  return error.status === 429 || error.code === 'over_email_send_rate_limit';
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const resolution = await resolveActiveVendorInvite(createServiceClient(), parsed.data.token);
  if (!resolution.ok) return apiFail(resolution.error.code, resolution.error.message, resolution.error.status);

  const db = await createClient();
  const { data, error } = await db.auth.verifyOtp({
    email: resolution.invite.email,
    token: parsed.data.code,
    type: 'email',
  });
  if (error && isRateLimited(error)) {
    return apiFail('OTP_RATE_LIMITED', 'Too many sign-in attempts were made. Please try again later.', 429);
  }
  if (error || !data.session) {
    return apiFail('OTP_INVALID', 'That code is invalid or has expired.', 422);
  }

  return apiOk({ verified: true });
}

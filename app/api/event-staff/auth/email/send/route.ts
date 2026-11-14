import { z } from "zod";
import { resolveActiveStaffLink } from "@/lib/events/event-staff";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { normalizeEmail } from "@/lib/validation/postgrest-filter";
import { checkoutEmailLocale } from "@/lib/email/locale";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

// ponytail: copies app/api/vendor-invite/auth/email/send (email comes from the body
// here, not an invite row); extract a shared OTP helper if a third copy appears.
const schema = z.object({
  token: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().min(1).max(80),
  captchaToken: z.string().trim().min(1).max(2048),
}).strict();

function isRateLimited(error: { code?: string; status?: number }) {
  return error.status === 429 || error.code === "over_email_send_rate_limit";
}

function mapOtpSendError(error: { code?: string; status?: number }) {
  if (error.code === "captcha_failed") return apiFail("HUMAN_VERIFICATION_FAILED", "Complete the security check and try again.", 403);
  if (isRateLimited(error)) return apiFail("OTP_RATE_LIMITED", "Too many sign-in codes were requested. Please try again later.", 429);
  return apiFail("OTP_SEND_FAILED", "Unable to send a sign-in code. Please try again.", 502);
}

/** Send a sign-in code to the email a staff member typed, only for a live staff link. */
export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const service = createServiceClient();
  const { link, error: linkError } = await resolveActiveStaffLink(service, parsed.data.token);
  if (linkError) return apiFail("DB_ERROR", "Unable to load this link", 500);
  if (!link) return apiFail("LINK_INVALID", "This link is invalid or has expired", 404);

  const email = normalizeEmail(parsed.data.email);
  const { data: profileExists, error: profileError } = await service.rpc("profile_email_exists", { p_email: email });
  if (profileError || typeof profileExists !== "boolean") {
    return apiFail("OTP_SEND_FAILED", "Unable to send a sign-in code. Please try again.", 502);
  }

  const db = await createClient();
  const { error } = await db.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: !profileExists,
      captchaToken: parsed.data.captchaToken,
      // Only a brand-new account takes the typed name and current language.
      ...(profileExists ? {} : { data: { full_name: parsed.data.displayName, preferred_locale: checkoutEmailLocale(request) } }),
    },
  });
  if (error) return mapOtpSendError(error);
  return apiOk({ sent: true });
}

import { z } from "zod";
import { resolveActiveStaffLink } from "@/lib/events/event-staff";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { normalizeEmail } from "@/lib/validation/postgrest-filter";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

// ponytail: copies app/api/vendor-invite/auth/email/verify with the email from the body.
const schema = z.object({
  token: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  code: z.string().regex(/^\d{6}$/),
}).strict();

/** Verify the emailed code; on success the Supabase session cookie is set. */
export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const { link, error: linkError } = await resolveActiveStaffLink(createServiceClient(), parsed.data.token);
  if (linkError) return apiFail("DB_ERROR", "Unable to load this link", 500);
  if (!link) return apiFail("LINK_INVALID", "This link is invalid or has expired", 404);

  const db = await createClient();
  const { data, error } = await db.auth.verifyOtp({ email: normalizeEmail(parsed.data.email), token: parsed.data.code, type: "email" });
  if (error && (error.status === 429 || error.code === "over_email_send_rate_limit")) {
    return apiFail("OTP_RATE_LIMITED", "Too many sign-in attempts were made. Please try again later.", 429);
  }
  if (error || !data.session) return apiFail("OTP_INVALID", "That code is invalid or has expired.", 422);
  return apiOk({ verified: true });
}

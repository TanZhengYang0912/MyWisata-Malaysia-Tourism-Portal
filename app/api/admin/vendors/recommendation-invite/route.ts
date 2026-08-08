import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiFail, apiOk } from '@/lib/validation/schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { createRecommendationInviteToken } from '@/lib/recommendations/invite-token';
import { enqueueVendorClaimInviteEmail } from '@/lib/email/events';
import { sendCustomVendorEmail } from '@/lib/email/sender';
import { z } from 'zod';

const schema = z
  .object({
    recommendationId: z.string().uuid(),
    email: z.string().trim().email().max(255).optional(),
    // Custom, admin-edited subject/body from the "Invite Vendor" modal's AI
    // draft (see lib/recommendations/invite-draft.ts). Optional — omitting
    // both keeps the legacy fixed-template email path below untouched.
    subject: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).max(5000).optional(),
  })
  .strict()
  .refine((data) => (data.subject === undefined) === (data.body === undefined), {
    message: 'subject and body must be provided together',
    path: ['body'],
  })
  .refine((data) => data.subject === undefined || data.email !== undefined, {
    message: 'email is required when sending a custom subject/body',
    path: ['email'],
  });

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(db, user.id))) return apiFail('FORBIDDEN', 'Admin role required', 403);

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const service = createServiceClient();
  const { data: recommendation, error: recommendationError } = await service
    .from('vendor_recommendations')
    .select('id,vendor_name,status')
    .eq('id', parsed.data.recommendationId)
    .maybeSingle();
  if (recommendationError) return apiFail('DB_ERROR', recommendationError.message, 500);
  if (!recommendation) return apiFail('NOT_FOUND', 'Recommendation not found', 404);
  if (!['approved', 'invited'].includes(recommendation.status)) {
    return apiFail('RECOMMENDATION_NOT_READY', 'Only approved recommendations can invite a vendor', 409);
  }

  const { token, tokenHash } = createRecommendationInviteToken();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const claimUrl = `${origin}/vendor/register?recommendation=${encodeURIComponent(token)}`;

  // The admin's edited body never carries the real link (it doesn't exist
  // until this exact point) — the server appends it after their text.
  const finalBody = parsed.data.body ? `${parsed.data.body}\n\nComplete your vendor sign-up here: ${claimUrl}` : null;

  const { data, error } = await service
    .from('vendor_recommendation_invites')
    .insert({
      recommendation_id: parsed.data.recommendationId,
      email: parsed.data.email ?? null,
      token_hash: tokenHash,
      // Only referenced on the custom-subject/body path — omitted entirely
      // (not just null) on the legacy path so that path keeps working on a
      // database that hasn't run the subject/body audit-column migration
      // yet (supabase/migrations/20260807000000_...).
      ...(parsed.data.subject ? { subject: parsed.data.subject, body: finalBody } : {}),
    })
    .select('id,expires_at')
    .single();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  const { error: statusError } = await service
    .from('vendor_recommendations')
    .update({ status: 'invited' })
    .eq('id', parsed.data.recommendationId);
  if (statusError) return apiFail('DB_ERROR', statusError.message, 500);

  let emailSent = false;
  if (parsed.data.subject && finalBody && parsed.data.email) {
    // Custom path — the admin-authored/AI-drafted subject+body, sent
    // synchronously (not via the email_outbox: this is a one-off,
    // admin-confirmed send with no natural dedupe key, not a retryable
    // system event).
    try {
      await sendCustomVendorEmail({ to: parsed.data.email, subject: parsed.data.subject, body: finalBody });
      emailSent = true;
    } catch (emailError) {
      console.error('[vendor-claim] custom invite email send failed:', emailError);
    }
  } else if (parsed.data.email) {
    // Legacy path — unchanged from before this feature: fixed-template
    // email via the outbox.
    try {
      await enqueueVendorClaimInviteEmail({
        recommendationId: parsed.data.recommendationId,
        email: parsed.data.email,
        vendorName: recommendation.vendor_name,
        claimUrl,
      });
      emailSent = true;
    } catch (emailError) {
      console.error('[vendor-claim] invite email enqueue failed:', emailError);
    }
  }

  return apiOk({ ...data, claimUrl, emailSent }, { status: 201 });
}

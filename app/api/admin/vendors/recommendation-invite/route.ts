import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiFail, apiOk } from '@/lib/validation/schemas';
import { createRecommendationInviteToken } from '@/lib/recommendations/invite-token';
import { sendCustomVendorEmail } from '@/lib/email/sender';
import { z } from 'zod';

const schema = z
  .object({
    recommendationId: z.string().uuid(),
    email: z.string().trim().email().max(255),
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
  });

export async function POST(request: Request) {
  const { response } = await requireStaffPermission('admin.vendor.manage');
  if (response) return response;

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
  const claimUrl = `${origin}/vendor-invite?recommendation=${encodeURIComponent(token)}`;

  // The admin's edited body never carries the real link (it doesn't exist
  // until this exact point) — the server appends it after their text.
  const finalBody = parsed.data.body ? `${parsed.data.body}\n\nComplete your vendor sign-up here: ${claimUrl}` : null;

  const { data, error } = await service
    .from('vendor_recommendation_invites')
    .insert({
      recommendation_id: parsed.data.recommendationId,
      email: parsed.data.email,
      token_hash: tokenHash,
      // Only referenced on the custom-subject/body path — omitted entirely
      // (not just null) on the legacy path so that path keeps working on a
      // database that hasn't run the subject/body audit-column migration
      // yet (supabase/migrations/20260807000000_...).
      // Persist the admin-reviewed prose for audit, but never the appended
      // claim URL: the database stores only the one-way token hash above.
      ...(parsed.data.subject ? { subject: parsed.data.subject, body: parsed.data.body } : {}),
    })
    .select('id,expires_at')
    .single();
  if (error) return apiFail('DB_ERROR', error.message, 500);

  try {
    // Send synchronously so the raw one-time token exists only in memory and
    // the outbound message. A durable outbox would persist the token.
    await sendCustomVendorEmail({
      to: parsed.data.email,
      subject: parsed.data.subject ?? `Complete ${recommendation.vendor_name} vendor onboarding`,
      body: finalBody
        ?? `Your business has been invited to complete vendor onboarding.\n\nComplete your vendor sign-up here: ${claimUrl}`,
    });
  } catch (emailError) {
    console.error('[vendor-claim] invite email delivery failed:', emailError);
    const { error: cancelError } = await service
      .from('vendor_recommendation_invites')
      .update({ status: 'cancelled' })
      .eq('id', data.id);
    if (cancelError) {
      console.error('[vendor-claim] failed to cancel undelivered invite:', cancelError);
    }
    return apiFail(
      'EMAIL_DELIVERY_FAILED',
      'The vendor invitation email could not be sent',
      502,
    );
  }

  const { error: statusError } = await service
    .from('vendor_recommendations')
    .update({ status: 'invited' })
    .eq('id', parsed.data.recommendationId);
  if (statusError) {
    console.error('[vendor-claim] invitation delivered but recommendation status sync failed:', statusError);
  }

  return apiOk({
    ...data,
    emailSent: true,
    statusSynced: !statusError,
  }, { status: 201 });
}

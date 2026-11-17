import { vendorInviteCopy } from '@/lib/email/copy';
import { z } from 'zod';
import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiFail, apiOk } from '@/lib/validation/schemas';
import { createRecommendationInviteToken } from '@/lib/recommendations/invite-token';
import { sendCustomVendorEmail } from '@/lib/email/sender';
import { BRAND_NAME } from '@/lib/i18n/invariant-tokens';
import { normalizeEmail } from '@/lib/validation/postgrest-filter';

// Admin-created event vendor (Phase 4 of the event plan). Same invite link and
// email path as recommendation invites; the vendor row is created only when the
// owner claims it (vendors.owner_id is required), then goes through the normal
// review, which also requires the owner's KYC for event vendors.
const schema = z.object({
  businessName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  message: z.string().trim().max(2000).optional(),
}).strict();

export async function POST(request: Request) {
  const { user, response } = await requireStaffPermission('admin.vendor.manage');
  if (response) return response;

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const { businessName, message } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const service = createServiceClient();

  const { data: owner, error: ownerError } = await service.from('users').select('id').eq('email', email).maybeSingle();
  if (ownerError) return apiFail('DB_ERROR', ownerError.message, 500);
  if (owner) {
    const { data: ownedVendor, error: vendorError } = await service.from('vendors').select('id').eq('owner_id', owner.id).in('status', ['pending', 'approved']).limit(1).maybeSingle();
    if (vendorError) return apiFail('DB_ERROR', vendorError.message, 500);
    if (ownedVendor) return apiFail('OWNER_ALREADY_HAS_VENDOR', 'This email already owns a vendor. Event vendors need their own login.', 409);
  }

  const copy = vendorInviteCopy(businessName, true, BRAND_NAME);

  const { token, tokenHash } = createRecommendationInviteToken();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const claimUrl = `${origin}/vendor-invite?recommendation=${encodeURIComponent(token)}`;
  const subject = copy.subject;
  const body = `${message ? `${message}\n\n` : ''}${copy.introduction}\n\n${copy.action}: ${claimUrl}`;

  const { data, error } = await service
    .from('vendor_recommendation_invites')
    .insert({ vendor_kind: 'event', business_name: businessName, email, token_hash: tokenHash, subject, body: message ?? null })
    .select('id,expires_at')
    .single();
  if (error) return apiFail('DB_ERROR', error.message, 500);

  try {
    // Sent synchronously so the raw one-time token lives only in memory and the email.
    await sendCustomVendorEmail({ to: email, subject, body });
  } catch (emailError) {
    console.error('[event-vendor-invite] email delivery failed:', emailError);
    const { error: cancelError } = await service.from('vendor_recommendation_invites').update({ status: 'cancelled' }).eq('id', data.id);
    if (cancelError) console.error('[event-vendor-invite] failed to cancel undelivered invite:', cancelError);
    return apiFail('EMAIL_DELIVERY_FAILED', 'The event vendor invitation email could not be sent', 502);
  }

  await service.from('audit_logs').insert({
    actor_id: user?.id ?? null,
    action: 'vendor.event_invite_sent',
    entity_type: 'vendor_invite',
    entity_id: data.id,
    after_data: { vendor_kind: 'event', business_name: businessName, email },
  });

  return apiOk({ ...data, emailSent: true }, { status: 201 });
}

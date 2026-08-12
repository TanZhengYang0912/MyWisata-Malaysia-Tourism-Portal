import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { hashRecommendationInviteToken } from '@/lib/recommendations/invite-token';
import { checkPhoneVerification } from '@/lib/verification/transaction-gates';

const claimSchema = z.object({
  token: z.string().trim().min(16).max(200),
  businessName: z.string().trim().min(2).max(255),
  legalBusinessName: z.string().trim().min(2).max(255),
  description: z.string().trim().min(10).max(2000),
  categoryId: z.string().uuid(),
  outletName: z.string().trim().min(2).max(255),
  contactEmail: z.string().trim().email().max(255),
  contactPhone: z.string().trim().max(50).optional(),
  businessAddress: z.string().trim().min(5).max(500),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  authorizedToRepresent: z.literal(true),
}).strict();

function claimError(message: string) {
  const mappings: Record<string, { code: string; status: number; text: string }> = {
    not_authenticated: { code: 'UNAUTHORIZED', status: 401, text: 'Sign in required' },
    invite_not_found: { code: 'INVITE_INVALID', status: 404, text: 'This vendor invitation is invalid.' },
    invite_expired: { code: 'INVITE_EXPIRED', status: 409, text: 'This vendor invitation has expired.' },
    invite_already_claimed: { code: 'INVITE_ALREADY_CLAIMED', status: 409, text: 'This vendor invitation has already been claimed.' },
    invite_email_mismatch: { code: 'INVITE_EMAIL_MISMATCH', status: 409, text: 'This invitation is bound to a different email account.' },
    email_mismatch: { code: 'INVITE_EMAIL_MISMATCH', status: 409, text: 'This invitation is bound to a different email account.' },
    invite_cancelled: { code: 'INVITE_CANCELLED', status: 409, text: 'This vendor invitation was cancelled.' },
    recommendation_not_claimable: { code: 'RECOMMENDATION_NOT_CLAIMABLE', status: 409, text: 'This recommendation is not ready for vendor claim.' },
    owner_already_has_vendor: { code: 'OWNER_ALREADY_HAS_VENDOR', status: 409, text: 'This account already owns a vendor.' },
    category_not_active: { code: 'CATEGORY_NOT_ACTIVE', status: 409, text: 'The selected vendor category is no longer available.' },
    phone_verification_required: { code: 'PHONE_VERIFICATION_REQUIRED', status: 403, text: 'Phone verification is required before claiming a vendor' },
  };
  const mapped = Object.entries(mappings).find(([key]) => message.includes(key))?.[1];
  return mapped ?? { code: 'CLAIM_FAILED', status: 409, text: 'Unable to claim this vendor invitation.' };
}

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: profile, error: profileError } = await db
    .from('users')
    .select('phone_verified_at')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return apiFail('VERIFICATION_STATUS_UNAVAILABLE', 'Unable to verify phone status', 503);
  const phoneGate = checkPhoneVerification(profile?.phone_verified_at);
  if (!phoneGate.allowed) return apiFail(phoneGate.code, 'Phone verification is required before claiming a vendor', 403);

  const parsed = await parseBody(request, claimSchema);
  if (!parsed.ok) return parsed.response;

  const { token, ...input } = parsed.data;
  const { data, error } = await db.rpc('claim_vendor_recommendation', {
    p_token_hash: hashRecommendationInviteToken(token),
    p_business_name: input.businessName,
    p_legal_business_name: input.legalBusinessName,
    p_description: input.description,
    p_category_id: input.categoryId,
    p_outlet_name: input.outletName,
    p_contact_email: input.contactEmail,
    p_contact_phone: input.contactPhone?.trim() || null,
    p_business_address: input.businessAddress,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
  });

  if (error) {
    const mapped = claimError(error.message ?? 'claim_failed');
    return apiFail(mapped.code, mapped.text, mapped.status);
  }
  return apiOk(data, { status: 201 });
}

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { hashRecommendationInviteToken } from '@/lib/recommendations/invite-token';
import { buildVendorInvitePreview } from '@/lib/recommendations/vendor-invite-preview';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const previewSchema = z.object({ token: z.string().trim().min(16).max(200) }).strict();

type RecommendationRow = {
  id: string;
  vendor_name: string;
  status: string;
  description: string | null;
  why_recommend: string | null;
  location_name: string | null;
  formatted_address: string | null;
  vendor_address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  categories: { name: string } | Array<{ name: string }> | null;
};

function categoryName(value: RecommendationRow['categories']) {
  return Array.isArray(value) ? value[0]?.name ?? null : value?.name ?? null;
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, previewSchema);
  if (!parsed.ok) return parsed.response;

  const service = createServiceClient();
  const { data: invite, error: inviteError } = await service
    .from('vendor_recommendation_invites')
    .select('recommendation_id,email,status,expires_at')
    .eq('token_hash', hashRecommendationInviteToken(parsed.data.token))
    .maybeSingle();

  if (inviteError || !invite) return apiFail('INVITE_INVALID', 'This invitation link is invalid.', 404);
  if (invite.status === 'cancelled') return apiFail('INVITE_CANCELLED', 'This vendor invitation was cancelled.', 409);
  if (invite.status !== 'invited') return apiFail('INVITE_ALREADY_CLAIMED', 'This vendor invitation has already been claimed.', 409);
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return apiFail('INVITE_EXPIRED', 'This vendor invitation has expired. Request a new invitation from MyWisata.', 409);
  }

  const { data: recommendation, error: recommendationError } = await service
    .from('vendor_recommendations')
    .select('id,vendor_name,status,description,why_recommend,location_name,formatted_address,vendor_address,contact_email,contact_phone,categories(name)')
    .eq('id', invite.recommendation_id)
    .maybeSingle();
  if (recommendationError || !recommendation || !['approved', 'invited'].includes(recommendation.status)) {
    return apiFail('RECOMMENDATION_NOT_READY', 'This recommendation is not ready for vendor claim.', 409);
  }

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const authenticated = Boolean(user);
  const emailMatched = Boolean(
    user?.email
    && invite.email
    && user.email.trim().toLowerCase() === invite.email.trim().toLowerCase(),
  );
  let phoneVerified = false;
  if (user && emailMatched) {
    const { data: profile } = await db
      .from('users')
      .select('phone_verified_at')
      .eq('id', user.id)
      .maybeSingle();
    phoneVerified = Boolean(profile?.phone_verified_at);
  }

  const { data: imageRows } = await service
    .from('recommendation_images')
    .select('id,storage_path,sort_order')
    .eq('recommendation_id', invite.recommendation_id)
    .eq('is_staged', false)
    .is('removed_at', null)
    .order('sort_order', { ascending: true });

  const signedImages = await Promise.all(
    ((imageRows ?? []) as Array<{ id: string; storage_path: string }>).map(async (image) => {
      const { data } = await service.storage
        .from('recommendation-images')
        .createSignedUrl(image.storage_path, 600);
      return data?.signedUrl ? { id: image.id, signedUrl: data.signedUrl } : null;
    }),
  );
  const row = recommendation as unknown as RecommendationRow;

  return apiOk(buildVendorInvitePreview({
    authenticated,
    emailMatched,
    phoneVerified,
    recommendation: {
      vendorName: row.vendor_name,
      description: row.description,
      whyRecommend: row.why_recommend,
      category: categoryName(row.categories),
      locationName: row.location_name,
      formattedAddress: row.formatted_address,
      fallbackAddress: row.vendor_address,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
    },
    images: signedImages.filter((image): image is NonNullable<typeof image> => image != null),
  }));
}

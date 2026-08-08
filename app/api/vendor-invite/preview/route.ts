import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { buildVendorInvitePreview } from '@/lib/recommendations/vendor-invite-preview';
import { resolveActiveVendorInvite } from '@/lib/recommendations/vendor-invite-access';
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
  category_id: string | null;
  latitude: number | null;
  longitude: number | null;
  categories: { id: string; name: string; slug: string } | Array<{ id: string; name: string; slug: string }> | null;
};

function category(value: RecommendationRow['categories']) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, previewSchema);
  if (!parsed.ok) return parsed.response;

  const service = createServiceClient();
  const resolution = await resolveActiveVendorInvite(service, parsed.data.token);
  if (!resolution.ok) return apiFail(resolution.error.code, resolution.error.message, resolution.error.status);
  const { invite } = resolution;

  const { data: recommendation, error: recommendationError } = await service
    .from('vendor_recommendations')
    .select('id,vendor_name,status,description,why_recommend,location_name,formatted_address,vendor_address,contact_email,contact_phone,category_id,latitude,longitude,categories(id,name,slug)')
    .eq('id', invite.recommendationId)
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
  let verifiedPhone: string | null = null;
  if (user && emailMatched) {
    const { data: profile } = await db
      .from('users')
      .select('phone,phone_verified_at')
      .eq('id', user.id)
      .maybeSingle();
    phoneVerified = Boolean(profile?.phone_verified_at);
    verifiedPhone = phoneVerified ? profile?.phone ?? null : null;
  }

  const { data: categories } = await service
    .from('categories')
    .select('id,name,slug')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  const { data: imageRows } = await service
    .from('recommendation_images')
    .select('id,storage_path,sort_order')
    .eq('recommendation_id', invite.recommendationId)
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
  const recommendationCategory = category(row.categories);

  return apiOk(buildVendorInvitePreview({
    inviteEmail: invite.email,
    authenticated,
    emailMatched,
    phoneVerified,
    verifiedPhone,
    categories: (categories ?? []) as Array<{ id: string; name: string; slug: string }>,
    recommendation: {
      vendorName: row.vendor_name,
      description: row.description,
      whyRecommend: row.why_recommend,
      categoryId: row.category_id,
      categoryName: recommendationCategory?.name ?? null,
      locationName: row.location_name,
      formattedAddress: row.formatted_address,
      fallbackAddress: row.vendor_address,
      latitude: row.latitude,
      longitude: row.longitude,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
    },
    images: signedImages.filter((image): image is NonNullable<typeof image> => image != null),
  }));
}
